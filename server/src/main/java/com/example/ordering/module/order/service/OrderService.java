package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
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

/**
 * 顾客端订单：创建（服务端重算价格 + 幂等 + 限量库存）、发起支付、取消、详情 / 历史、退款申请。
 * 顾客请求没有门店上下文，所有查询显式带 customer_id / store_id。
 */
@Slf4j
@Service
public class OrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final DishMapper dishMapper;
    private final DiningTableMapper tableMapper;
    private final MenuGroupLoader groupLoader;
    private final com.example.ordering.module.menu.mapper.CategoryMapper categoryMapper;
    private final StoreService storeService;
    private final OrderStateService orderStateService;
    private final OrderViewAssembler assembler;
    private final PayService payService;
    private final RefundService refundService;
    private final TransactionTemplate tx;

    public OrderService(OrderMapper orderMapper, OrderItemMapper orderItemMapper, DishMapper dishMapper,
                        DiningTableMapper tableMapper, MenuGroupLoader groupLoader,
                        com.example.ordering.module.menu.mapper.CategoryMapper categoryMapper, StoreService storeService,
                        OrderStateService orderStateService, OrderViewAssembler assembler, PayService payService,
                        RefundService refundService, TransactionTemplate tx) {
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.dishMapper = dishMapper;
        this.tableMapper = tableMapper;
        this.groupLoader = groupLoader;
        this.categoryMapper = categoryMapper;
        this.storeService = storeService;
        this.orderStateService = orderStateService;
        this.assembler = assembler;
        this.payService = payService;
        this.refundService = refundService;
        this.tx = tx;
    }

    // ==================== 创建 ====================

    public OrderDetail create(CreateOrderRequest req) {
        LoginUser user = LoginUser.currentCustomer();
        // 幂等：同一顾客同一 clientRequestId 直接返回已有订单
        Order existing = findByClientRequest(user.id(), req.clientRequestId());
        if (existing != null) {
            return assembler.detail(existing, true);
        }
        try {
            Order order = tx.execute(status -> doCreate(user, req));
            return assembler.detail(order, true);
        } catch (DuplicateKeyException e) {
            // 并发重复提交：唯一键 (customer_id, client_request_id) 冲突，返回先创建成功的那笔
            Order order = findByClientRequest(user.id(), req.clientRequestId());
            if (order != null) {
                return assembler.detail(order, true);
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

        // 2. 菜品与规格 / 加料
        Set<Long> dishIds = req.items().stream().map(CreateOrderRequest.Item::dishId).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, Dish> dishes = dishMapper.selectList(Wrappers.<Dish>lambdaQuery()
                        .eq(Dish::getStoreId, store.getId()).in(Dish::getId, dishIds)).stream()
                .collect(Collectors.toMap(Dish::getId, Function.identity()));
        // 分类被停用（顾客菜单已隐藏）的菜品同样不能下单
        Set<Long> categoryIds = dishes.values().stream().map(Dish::getCategoryId).collect(Collectors.toSet());
        Set<Long> enabledCategories = categoryIds.isEmpty() ? Set.of() : categoryMapper.selectBatchIds(categoryIds).stream()
                .filter(c -> c.getStatus() != null && c.getStatus() == 1)
                .map(com.example.ordering.module.menu.entity.Category::getId)
                .collect(Collectors.toSet());
        Map<Long, List<SpecGroupView>> specs = groupLoader.loadSpecGroups(dishIds);
        Map<Long, List<AddonGroupView>> addons = groupLoader.loadAddonGroups(dishIds);

        List<OrderItem> items = new ArrayList<>();
        long total = 0;
        for (CreateOrderRequest.Item in : req.items()) {
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

        // 3. 限量库存扣减（同一事务内，失败整体回滚）
        Map<Long, Integer> qtyByDish = new java.util.LinkedHashMap<>();
        for (OrderItem item : items) {
            qtyByDish.merge(item.getDishId(), item.getQuantity(), Integer::sum);
        }
        for (Map.Entry<Long, Integer> e : qtyByDish.entrySet()) {
            if (!orderStateService.deductStock(e.getKey(), e.getValue())) {
                throw new BusinessException(ErrorCode.SOLD_OUT, "「" + dishes.get(e.getKey()).getName() + "」库存不足");
            }
        }

        // 4. 落库
        int payTimeout = store.getPayTimeoutMin() == null ? 15 : store.getPayTimeoutMin();
        Order order = new Order();
        order.setOrderNo(OrderNoGenerator.orderNo());
        order.setClientRequestId(req.clientRequestId());
        order.setStoreId(store.getId());
        order.setTableId(table.getId());
        order.setTableCode(table.getCode());
        order.setCustomerId(user.id());
        order.setPlatform(user.platform());
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
            // 关单前先向渠道确认：顾客可能刚付完、回调还没到
            PayService.PayCheck check = payService.queryAndSync(order);
            if (check == PayService.PayCheck.PAID) {
                throw new BusinessException(ErrorCode.CONFLICT, "订单已支付，请刷新查看");
            }
            if (check == PayService.PayCheck.UNKNOWN) {
                throw new BusinessException(ErrorCode.CONFLICT, "正在确认支付结果，请稍后刷新");
            }
            // 自调用不经过代理，用模板显式开事务
            tx.executeWithoutResult(s -> closeExpired(order, "支付超时自动关闭"));
            throw new BusinessException(ErrorCode.CONFLICT, "订单已超时，请重新下单");
        }
        return payService.initiate(order);
    }

    public OrderDetail mockPay(String orderNo) {
        Order order = ownOrder(orderNo);
        payService.mockPay(order);
        return assembler.detail(orderStateService.getById(order.getId()), true);
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
            payService.closePendingPayments(order);
        } else if (order.getStatus() == OrderStatus.PAID) {
            orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.CANCELLED,
                    OperatorType.CUSTOMER, order.getCustomerId(), remark);
            orderStateService.restoreStock(order.getId());
            refundService.fullRefund(order, null, RefundInitiator.CUSTOMER, null, remark);
        } else {
            throw new BusinessException(ErrorCode.CONFLICT, "订单已接单，如需退款请申请退款");
        }
        return assembler.detail(order, true);
    }

    /** 待支付超时关闭（定时任务 / 支付时发现过期），幂等 */
    @Transactional
    public void closeExpired(Order order, String remark) {
        if (orderStateService.transition(order, OrderStatus.PENDING_PAY, OrderStatus.CLOSED, OperatorType.SYSTEM, null, remark)) {
            orderStateService.restoreStock(order.getId());
            payService.closePendingPayments(order);
        }
    }

    // ==================== 查询 ====================

    public OrderDetail detail(String orderNo) {
        return assembler.detail(ownOrder(orderNo), true);
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
        return refundService.customerApply(ownOrder(orderNo), req);
    }

    public List<RefundView> refunds(String orderNo) {
        return refundService.listByOrder(ownOrder(orderNo));
    }

    public RefundView withdrawRefund(String refundNo) {
        return refundService.customerWithdraw(refundNo, LoginUser.currentCustomer().id());
    }

    /** 当前顾客的订单；他人订单一律 404，避免泄露存在性 */
    private Order ownOrder(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        if (!order.getCustomerId().equals(LoginUser.currentCustomer().id())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        }
        return order;
    }
}
