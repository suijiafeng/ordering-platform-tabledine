package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.module.menu.dto.AddonGroupView;
import com.example.ordering.module.menu.dto.SpecGroupView;
import com.example.ordering.module.menu.entity.Dish;
import com.example.ordering.module.menu.mapper.DishMapper;
import com.example.ordering.module.menu.service.MenuGroupLoader;
import com.example.ordering.module.order.dto.CreateOrderRequest;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.dto.PayInitResult;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.RefundStatusOfOrder;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.refund.dto.CustomerRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.module.table.entity.DiningTable;
import com.example.ordering.module.table.mapper.DiningTableMapper;
import com.example.ordering.security.LoginUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import com.example.ordering.module.menu.mapper.CategoryMapper;
import com.example.ordering.module.menu.service.DailyStockService;
import java.util.LinkedHashMap;

/**
 * 顾客端订单：创建（服务端重算价格 + 幂等 + 限量库存）、发起支付、取消、详情 / 历史、退款申请。
 * 顾客请求没有门店上下文，所有查询显式带 customer_id / store_id。
 */
@Slf4j
@Service
public class CustomerOrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final DishMapper dishMapper;
    private final DiningTableMapper tableMapper;
    private final MenuGroupLoader groupLoader;
    private final CategoryMapper categoryMapper;
    private final DailyStockService dailyStockService;
    private final StoreService storeService;
    private final OrderStateService orderStateService;
    private final OrderViewAssembler assembler;
    private final PayService payService;
    private final RefundService refundService;
    private final TransactionTemplate tx;
    private final CustomerMapper customerMapper;

    public CustomerOrderService(OrderMapper orderMapper, OrderItemMapper orderItemMapper, DishMapper dishMapper,
                        DiningTableMapper tableMapper, MenuGroupLoader groupLoader,
                        CategoryMapper categoryMapper,
                        DailyStockService dailyStockService, StoreService storeService,
                        OrderStateService orderStateService, OrderViewAssembler assembler, PayService payService,
                        RefundService refundService, TransactionTemplate tx, CustomerMapper customerMapper) {
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.dishMapper = dishMapper;
        this.tableMapper = tableMapper;
        this.groupLoader = groupLoader;
        this.categoryMapper = categoryMapper;
        this.dailyStockService = dailyStockService;
        this.storeService = storeService;
        this.orderStateService = orderStateService;
        this.assembler = assembler;
        this.payService = payService;
        this.refundService = refundService;
        this.tx = tx;
        this.customerMapper = customerMapper;
    }

    // ==================== 创建 ====================

    public OrderDetail create(CreateOrderRequest req) {
        LoginUser user = LoginUser.currentCustomer();
        // 幂等：同一顾客同一 clientRequestId 直接返回已有订单
        Order existing = findByClientRequest(user.id(), req.clientRequestId());
        if (existing != null) {
            return assembler.customerDetail(existing);
        }
        try {
            Order order = tx.execute(status -> doCreate(user, req));
            return assembler.customerDetail(order);
        } catch (DuplicateKeyException e) {
            // 并发重复提交：唯一键 (customer_id, client_request_id) 冲突，返回先创建成功的那笔
            Order order = findByClientRequest(user.id(), req.clientRequestId());
            if (order != null) {
                return assembler.customerDetail(order);
            }
            throw e;
        }
    }

    private Order findByClientRequest(Long customerId, String clientRequestId) {
        return orderMapper.selectOne(Wrappers.<Order>lambdaQuery()
                .eq(Order::getCustomerId, customerId)
                .eq(Order::getClientRequestId, clientRequestId));
    }

    private Order doCreate(LoginUser user, CreateOrderRequest req) {
        // 1. 桌台与店铺
        DiningTable table = tableMapper.selectOne(Wrappers.<DiningTable>lambdaQuery().eq(DiningTable::getQrToken, req.qrToken()));
        if (table == null || table.getStatus() == null || table.getStatus() != DiningTable.STATUS_ENABLED) {
            throw new BusinessException(ErrorCode.QR_INVALID);
        }
        Store store = storeService.getRequired(table.getStoreId());
        if (!store.isOpen()) {
            throw new BusinessException(ErrorCode.STORE_CLOSED);
        }
        // 会员余额由开户门店收取，只能在该门店消费（否则 A 店收的钱在 B 店花掉，两边账都对不上）
        Customer customer = customerMapper.selectById(user.id());
        if (customer == null || !store.getId().equals(customer.getStoreId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "当前会员账号不属于本店，请使用本店会员账号下单");
        }

        // 2-3. 菜品校验、计价与限量库存扣减（顾客下单与前厅代客下单共用）
        PreparedItems prepared = prepareItems(store, req.items());
        List<OrderItem> items = prepared.items();
        long total = prepared.total();

        // 4. 落库
        int payTimeout = store.getPayTimeoutMin() == null ? 15 : store.getPayTimeoutMin();
        Order order = new Order();
        order.setOrderNo(OrderNoGenerator.orderNo());
        order.setClientRequestId(req.clientRequestId());
        order.setStoreId(store.getId());
        order.setTableId(table.getId());
        order.setTableCode(table.getCode());
        order.setCustomerId(user.id());
        order.setPlatform(Platform.H5);
        order.setSource(Order.SOURCE_CUSTOMER);
        order.setStatus(OrderStatus.PENDING_PAY);
        order.setRefundStatus(RefundStatusOfOrder.NONE);
        order.setTotalAmount(total);
        order.setPayAmount(total);
        order.setRefundedAmount(0L);
        order.setPeopleCount(req.peopleCount() == null ? 1 : req.peopleCount());
        order.setRemark(StringUtils.hasText(req.remark()) ? req.remark().trim() : null);
        order.setPayExpireAt(OffsetDateTime.now().plusMinutes(payTimeout));
        order.setVersion(0);
        orderMapper.insert(order);
        for (OrderItem item : items) {
            item.setOrderId(order.getId());
            item.setRefundedQty(0);
            orderItemMapper.insert(item);
        }
        orderStateService.log(order.getId(), null, OrderStatus.PENDING_PAY, OperatorType.CUSTOMER, user.id(), "创建订单");
        return order;
    }

    /** 已校验、已计价、已扣限量库存的订单明细 */
    record PreparedItems(List<OrderItem> items, long total) {
    }

    /**
     * 菜品校验（上架、分类启用、售罄、规格加料）、服务端重新计价、限量库存扣减。
     * 必须在调用方的事务里执行：后续落库失败时库存扣减随事务回滚。
     */
    PreparedItems prepareItems(Store store, List<CreateOrderRequest.Item> reqItems) {
        Set<Long> dishIds = reqItems.stream().map(CreateOrderRequest.Item::dishId).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, Dish> dishes = dishMapper.selectList(Wrappers.<Dish>lambdaQuery()
                        .eq(Dish::getStoreId, store.getId()).in(Dish::getId, dishIds)).stream()
                .collect(Collectors.toMap(Dish::getId, Function.identity()));
        // 分类被停用（顾客菜单已隐藏）的菜品同样不能下单
        Set<Long> categoryIds = dishes.values().stream().map(Dish::getCategoryId).collect(Collectors.toSet());
        Set<Long> enabledCategories = categoryIds.isEmpty() ? Set.of() : categoryMapper.selectBatchIds(categoryIds).stream()
                .filter(com.example.ordering.module.menu.entity.Category::isEnabled)
                .map(com.example.ordering.module.menu.entity.Category::getId)
                .collect(Collectors.toSet());
        Map<Long, List<SpecGroupView>> specs = groupLoader.loadSpecGroups(dishIds);
        Map<Long, List<AddonGroupView>> addons = groupLoader.loadAddonGroups(dishIds);

        List<OrderItem> items = new ArrayList<>();
        long total = 0;
        for (CreateOrderRequest.Item in : reqItems) {
            Dish dish = dishes.get(in.dishId());
            if (dish == null || dish.getStatus() == null || dish.getStatus() != Dish.STATUS_ON_SHELF
                    || !enabledCategories.contains(dish.getCategoryId())) {
                throw new BusinessException(ErrorCode.CONFLICT, "菜品已下架，请刷新菜单");
            }
            if (dish.soldOutForCustomer()) {
                throw new BusinessException(ErrorCode.SOLD_OUT, "「" + dish.getName() + "」已售罄");
            }
            OrderItem item = buildItem(dish, in, specs.getOrDefault(dish.getId(), List.of()), addons.getOrDefault(dish.getId(), List.of()));
            items.add(item);
            total += item.getTotalPrice();
        }

        // 3. 限量库存扣减（同一事务内，失败整体回滚）；先补做可能错过的 0 点重置
        dailyStockService.ensureFresh();
        Map<Long, Integer> qtyByDish = new LinkedHashMap<>();
        for (OrderItem item : items) {
            qtyByDish.merge(item.getDishId(), item.getQuantity(), Integer::sum);
        }
        for (Map.Entry<Long, Integer> e : qtyByDish.entrySet()) {
            if (!orderStateService.deductStock(e.getKey(), e.getValue())) {
                throw new BusinessException(ErrorCode.SOLD_OUT, "「" + dishes.get(e.getKey()).getName() + "」库存不足");
            }
        }

        return new PreparedItems(items, total);
    }

    /** 校验规格 / 加料选择并计算单价：基础价 + 规格加价 + 加料加价 */
    static OrderItem buildItem(Dish dish, CreateOrderRequest.Item in, List<SpecGroupView> specGroups, List<AddonGroupView> addonGroups) {
        Set<Long> specIds = new LinkedHashSet<>(in.specItemIds() == null ? List.of() : in.specItemIds());
        Set<Long> addonIds = new LinkedHashSet<>(in.addonItemIds() == null ? List.of() : in.addonItemIds());
        long unit = dish.getPrice();
        List<String> specNames = new ArrayList<>();
        List<String> addonNames = new ArrayList<>();
        Set<Long> seen = new HashSet<>();

        for (SpecGroupView g : specGroups) {
            List<SpecGroupView.SpecItemView> chosen = g.items().stream().filter(i -> specIds.contains(i.id())).toList();
            if (chosen.size() > 1) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」的" + g.name() + "只能选一项");
            }
            if (chosen.isEmpty() && g.required()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」请选择" + g.name());
            }
            for (SpecGroupView.SpecItemView i : chosen) {
                unit += i.priceDelta();
                specNames.add(i.name());
                seen.add(i.id());
            }
        }
        if (!seen.containsAll(specIds)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」的规格选择无效，请刷新菜单");
        }
        seen.clear();
        for (AddonGroupView g : addonGroups) {
            List<AddonGroupView.AddonItemView> chosen = g.items().stream().filter(i -> addonIds.contains(i.id())).toList();
            if (chosen.size() > g.maxCount()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」的" + g.name() + "最多选 " + g.maxCount() + " 项");
            }
            for (AddonGroupView.AddonItemView i : chosen) {
                unit += i.priceDelta();
                addonNames.add(i.name());
                seen.add(i.id());
            }
        }
        if (!seen.containsAll(addonIds)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」的加料选择无效，请刷新菜单");
        }

        if (unit < 1) {
            // 菜品保存时已校验；这里兜底历史数据，避免负价抵扣其他菜品或产生无法支付的 0 元订单
            throw new BusinessException(ErrorCode.PARAM_INVALID, "「" + dish.getName() + "」价格配置异常，请联系店员");
        }
        OrderItem item = new OrderItem();
        item.setDishId(dish.getId());
        item.setDishName(dish.getName());
        item.setDishImage(dish.getImage());
        item.setSpecItemIds(new ArrayList<>(specIds));
        item.setAddonItemIds(new ArrayList<>(addonIds));
        item.setSpecDesc(specNames.isEmpty() ? null : String.join("/", specNames));
        item.setAddonDesc(addonNames.isEmpty() ? null : String.join(", ", addonNames));
        item.setUnitPrice(unit);
        item.setQuantity(in.quantity());
        item.setTotalPrice(unit * in.quantity());
        return item;
    }

    // ==================== 支付 / 取消 ====================

    public PayInitResult pay(String orderNo) {
        Order order = ownOrder(orderNo);
        if (order.getStatus() == OrderStatus.PENDING_PAY && order.getPayExpireAt().isBefore(OffsetDateTime.now())) {
            // 自调用不经过代理，用模板显式开事务
            tx.executeWithoutResult(s -> closeExpired(order, "支付超时自动关闭"));
            throw new BusinessException(ErrorCode.CONFLICT, "订单已超时，请重新下单");
        }
        return payService.initiate(order);
    }

    /** 顾客取消：待支付 → 关闭（回补库存）；待接单 → 取消 + 自动全额退款（回补库存） */
    @Transactional
    public OrderDetail cancel(String orderNo, String reason) {
        Order order = ownOrder(orderNo);
        String remark = StringUtils.hasText(reason) ? "顾客取消：" + reason.trim() : "顾客取消";
        if (order.getStatus() == OrderStatus.PENDING_PAY) {
            orderStateService.transitionOrConflict(order, OrderStatus.PENDING_PAY, OrderStatus.CLOSED,
                    OperatorType.CUSTOMER, order.getCustomerId(), remark);
            orderStateService.restoreStock(order.getId());
        } else if (order.getStatus() == OrderStatus.PAID) {
            orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.CANCELLED,
                    OperatorType.CUSTOMER, order.getCustomerId(), remark);
            orderStateService.restoreStock(order.getId());
            refundService.refundOrder(order, RefundInitiator.CUSTOMER, null, remark);
        } else if (order.getStatus() == OrderStatus.MAKING) {
            throw new BusinessException(ErrorCode.CONFLICT, "商家已接单，请申请取消，商家确认后才能取消");
        } else {
            throw new BusinessException(ErrorCode.CONFLICT, "订单当前不能取消，如需退款请申请退款");
        }
        return assembler.customerDetail(order);
    }

    /**
     * 商家已接单后申请取消：只能在后厨开始制作前申请，每单一次，需前厅 / 店主确认后才取消并退款。
     * 条件更新保证与「后厨开始制作」并发时只有一方生效：后厨先开始，则申请失败。
     */
    @Transactional
    public OrderDetail requestCancel(String orderNo, String reason) {
        Order order = ownOrder(orderNo);
        if (!assembler.canRequestCancel(order)) {
            throw new BusinessException(ErrorCode.CONFLICT, cancelRequestBlockedReason(order));
        }
        int updated = orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                .set(Order::getCancelRequestStatus, Order.CANCEL_APPLYING)
                .set(Order::getCancelRequestReason, StringUtils.hasText(reason) ? reason.trim() : null)
                .set(Order::getCancelRequestedAt, OffsetDateTime.now())
                .eq(Order::getId, order.getId())
                .eq(Order::getStatus, OrderStatus.MAKING)
                .isNull(Order::getCookingStartedAt)
                .isNull(Order::getCancelRequestStatus));
        if (updated == 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "后厨已开始制作，无法取消；如有问题请申请退款或联系店员");
        }
        return assembler.customerDetail(orderMapper.selectById(order.getId()));
    }

    private static String cancelRequestBlockedReason(Order order) {
        if (order.getCancelRequestStatus() != null) {
            return order.isCancelApplying() ? "已申请取消，请等待商家确认" : "该订单已申请过取消";
        }
        if (order.getStatus() == OrderStatus.MAKING && order.getCookingStartedAt() != null) {
            return "后厨已开始制作，无法取消；如有问题请申请退款或联系店员";
        }
        if (order.getStatus() == OrderStatus.PENDING_PAY || order.getStatus() == OrderStatus.PAID) {
            return "商家还未接单，可直接取消订单";
        }
        return "订单当前不能申请取消";
    }

    /** 待支付超时关闭（定时任务 / 支付时发现过期），幂等；返回本次是否真的关闭了 */
    @Transactional
    public boolean closeExpired(Order order, String remark) {
        if (orderStateService.transition(order, OrderStatus.PENDING_PAY, OrderStatus.CLOSED, OperatorType.SYSTEM, null, remark)) {
            orderStateService.restoreStock(order.getId());
            return true;
        }
        return false;
    }

    // ==================== 查询 ====================

    public OrderDetail detail(String orderNo) {
        return assembler.customerDetail(ownOrder(orderNo));
    }

    public PageResult<OrderSummary> history(int page, int pageSize) {
        LoginUser user = LoginUser.currentCustomer();
        Page<Order> result = orderMapper.selectPage(new Page<>(page, pageSize), Wrappers.<Order>lambdaQuery()
                .eq(Order::getCustomerId, user.id())
                .orderByDesc(Order::getId));
        return new PageResult<>(assembler.summaries(result.getRecords()), result.getTotal(), result.getCurrent(), result.getSize());
    }

    // ==================== 退款 ====================

    public RefundView applyRefund(String orderNo, CustomerRefundRequest req) {
        Order order = ownOrder(orderNo);
        if (order.isCancelApplying()) {
            throw new BusinessException(ErrorCode.CONFLICT, "已申请取消，请等待商家确认");
        }
        if (order.getStatus() == OrderStatus.MAKING && order.getCookingStartedAt() == null) {
            // 后厨还没开工：应当申请取消（商家确认后全额退款），而不是申请退款
            throw new BusinessException(ErrorCode.CONFLICT, "后厨还没开始制作，如不想要了请申请取消订单");
        }
        return refundService.customerApply(order, req);
    }

    public List<RefundView> refunds(String orderNo) {
        return refundService.listByOrderForCustomer(ownOrder(orderNo));
    }

    public RefundView withdrawRefund(String refundNo) {
        return refundService.customerWithdraw(refundNo, LoginUser.currentCustomer().id());
    }

    /** 当前顾客的订单；他人订单一律 404，避免泄露存在性 */
    private Order ownOrder(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        // 代客下单的订单没有顾客账号（customerId 为空），按「不是你的订单」处理而不是空指针
        if (!java.util.Objects.equals(order.getCustomerId(), LoginUser.currentCustomer().id())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        }
        return order;
    }
}
