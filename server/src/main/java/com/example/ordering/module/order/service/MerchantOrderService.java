package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.order.dto.NewOrderCount;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.mapper.RefundMapper;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.security.LoginUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * 商家端订单：列表 / 详情 / 履约流转 / 拒单 / 整单取消 / 新订单轮询。
 * 所有查询经多租户插件自动限定当前门店。
 */
@Service
public class MerchantOrderService {

    /** 退款申请多久未审核算「超时」（需求 §7.3 默认 2 小时） */
    static final int REFUND_REVIEW_OVERDUE_HOURS = 2;

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final OrderMapper orderMapper;
    private final RefundMapper refundMapper;
    private final OrderStateService orderStateService;
    private final OrderViewAssembler assembler;
    private final RefundService refundService;

    public MerchantOrderService(OrderMapper orderMapper, RefundMapper refundMapper, OrderStateService orderStateService,
                                OrderViewAssembler assembler, RefundService refundService) {
        this.orderMapper = orderMapper;
        this.refundMapper = refundMapper;
        this.orderStateService = orderStateService;
        this.assembler = assembler;
        this.refundService = refundService;
    }

    // ==================== 查询 ====================

    /**
     * @param status  逗号分隔的状态列表，空 = 全部
     * @param keyword 订单号 / 桌号模糊匹配
     * @param date    yyyy-MM-dd，按下单日期过滤（空 = 不限）
     */
    public PageResult<OrderSummary> list(String status, String keyword, String date, int page, int pageSize) {
        return list(status, keyword, date, null, false, page, pageSize);
    }

    /**
     * cancelRequest=APPLYING：只看顾客申请取消、待处理的订单；
     * unsettled=true：只看先吃后付、还没结账的订单（未取消）
     */
    public PageResult<OrderSummary> list(String status, String keyword, String date, String cancelRequest, boolean unsettled,
                                         int page, int pageSize) {
        LambdaQueryWrapper<Order> query = Wrappers.<Order>lambdaQuery();
        List<OrderStatus> statuses = parseStatuses(status);
        if (!statuses.isEmpty()) {
            query.in(Order::getStatus, statuses);
        }
        if (unsettled) {
            query.eq(Order::getPayMode, Order.PAY_LATER).isNull(Order::getPaidAt)
                    .notIn(Order::getStatus, OrderStatus.CANCELLED, OrderStatus.CLOSED);
        }
        if (Order.CANCEL_APPLYING.equals(cancelRequest)) {
            query.eq(Order::getCancelRequestStatus, Order.CANCEL_APPLYING).eq(Order::getStatus, OrderStatus.MAKING);
        }
        if (StringUtils.hasText(keyword)) {
            String k = keyword.trim();
            query.and(w -> w.like(Order::getOrderNo, k).or().like(Order::getTableCode, k));
        }
        if (StringUtils.hasText(date)) {
            LocalDate d = LocalDate.parse(date.trim());
            OffsetDateTime from = d.atStartOfDay(CN).toOffsetDateTime();
            query.ge(Order::getCreatedAt, from).lt(Order::getCreatedAt, from.plusDays(1));
        }
        query.orderByDesc(Order::getId);
        Page<Order> result = orderMapper.selectPage(new Page<>(page, pageSize), query);
        return new PageResult<>(assembler.summaries(result.getRecords()), result.getTotal(), result.getCurrent(), result.getSize());
    }

    /**
     * 后厨队列：前厅（或自动接单）确认过的订单，按接单时间先后。前端分三栏：
     * 待制作（MAKING、未开始）→ 制作中（MAKING、已开始）→ 待取餐（READY，等前厅取餐送达，只读）。
     * 待接单由前厅在订单管理处理，送达也由前厅完成——后厨只负责制作，权责分离。
     */
    public List<OrderSummary> kitchenQueue() {
        List<Order> orders = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .in(Order::getStatus, OrderStatus.MAKING, OrderStatus.READY)
                .orderByAsc(Order::getAcceptedAt, Order::getId)
                .last("LIMIT 200"));
        return assembler.summaries(orders);
    }

    public OrderDetail detail(String orderNo) {
        return assembler.merchantDetail(orderStateService.getByNo(orderNo));
    }

    /** 轮询：since 之后新支付的订单数 + 待处理数量 */
    public NewOrderCount newCount(OffsetDateTime since) {
        OffsetDateTime now = OffsetDateTime.now();
        long newPaid = since == null ? 0 : orderMapper.selectCount(Wrappers.<Order>lambdaQuery()
                .in(Order::getStatus, OrderStatus.PAID, OrderStatus.MAKING, OrderStatus.READY, OrderStatus.DONE, OrderStatus.CANCELLED)
                .gt(Order::getPaidAt, since));
        List<String> pendingNos = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                        .select(Order::getOrderNo).eq(Order::getStatus, OrderStatus.PAID).orderByAsc(Order::getId).last("LIMIT 500"))
                .stream().map(Order::getOrderNo).toList();
        long pendingAccept = pendingNos.size();
        // 制作中订单号：后厨按集合去重判断「新到的制作单」（前厅刚确认的），与前厅判断新支付订单同一做法
        List<String> makingNos = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                        .select(Order::getOrderNo).eq(Order::getStatus, OrderStatus.MAKING).orderByAsc(Order::getId).last("LIMIT 500"))
                .stream().map(Order::getOrderNo).toList();
        long making = makingNos.size();
        long ready = orderMapper.selectCount(Wrappers.<Order>lambdaQuery().eq(Order::getStatus, OrderStatus.READY));
        long unsettled = orderMapper.selectCount(Wrappers.<Order>lambdaQuery()
                .eq(Order::getPayMode, Order.PAY_LATER).isNull(Order::getPaidAt)
                .notIn(Order::getStatus, OrderStatus.CANCELLED, OrderStatus.CLOSED));
        long cancelRequests = orderMapper.selectCount(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.MAKING).eq(Order::getCancelRequestStatus, Order.CANCEL_APPLYING));
        long applying = refundMapper.selectCount(Wrappers.<Refund>lambdaQuery().eq(Refund::getStatus, RefundStatus.APPLYING));
        long failed = refundMapper.selectCount(Wrappers.<Refund>lambdaQuery().eq(Refund::getStatus, RefundStatus.FAILED));
        // 与 OrderTasks.remindApplyingRefunds 同一口径（2 小时）；这里给商家端轮询展示，定时任务只写日志
        long overdue = refundMapper.selectCount(Wrappers.<Refund>lambdaQuery()
                .eq(Refund::getStatus, RefundStatus.APPLYING)
                .lt(Refund::getCreatedAt, now.minusHours(REFUND_REVIEW_OVERDUE_HOURS)));
        return new NewOrderCount(newPaid, pendingAccept, making, applying, failed, now, pendingNos, overdue, ready, makingNos, cancelRequests, unsettled);
    }

    // ==================== 履约流转 ====================

    @Transactional
    public OrderDetail accept(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.MAKING, OperatorType.MERCHANT, staff.id(), "商家接单");
        return assembler.merchantDetail(order);
    }

    /** 拒单：待接单 → 已取消 + 全额退款 + 回补库存（店员可操作） */
    @Transactional
    public OrderDetail reject(String orderNo, String reason) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        String remark = StringUtils.hasText(reason) ? "商家拒单：" + reason.trim() : "商家拒单";
        orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.CANCELLED, OperatorType.MERCHANT, staff.id(), remark);
        orderStateService.restoreStock(order.getId());
        refundService.refundOrder(order, RefundInitiator.MERCHANT, staff.id(), remark);
        return assembler.merchantDetail(order);
    }

    /**
     * 后厨开始制作：待制作 → 制作中。不改变订单状态（仍是 MAKING），只记录开始时间；
     * 条件更新保证并发 / 重复点击只生效一次，订单已不在制作中（被取消、已出餐）时返回冲突。
     */
    public OrderDetail startCooking(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        if (order.isCancelApplying()) {
            throw new BusinessException(ErrorCode.CONFLICT, "顾客正在申请取消，请等前厅处理后再制作");
        }
        // 与顾客「申请取消」互斥：两边都是条件更新，同一时刻只有一方能成功
        int updated = orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                .set(Order::getCookingStartedAt, OffsetDateTime.now())
                .eq(Order::getId, order.getId())
                .eq(Order::getStatus, OrderStatus.MAKING)
                .isNull(Order::getCookingStartedAt)
                .and(w -> w.isNull(Order::getCancelRequestStatus).or().ne(Order::getCancelRequestStatus, Order.CANCEL_APPLYING)));
        if (updated == 0) {
            Order latest = orderMapper.selectById(order.getId());
            throw new BusinessException(ErrorCode.CONFLICT, latest != null && latest.isCancelApplying()
                    ? "顾客正在申请取消，请等前厅处理后再制作" : "订单状态已变化，请刷新后重试");
        }
        return assembler.merchantDetail(orderStateService.getByNo(orderNo));
    }

    @Transactional
    public OrderDetail ready(String orderNo) {
        // 锁住订单行再判断取消申请：与顾客「申请取消」（条件更新要求 status = MAKING）互斥，
        // 否则并发下可能出餐后仍挂着一条没人能处理的取消申请
        Order order = orderStateService.lockByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        if (order.isCancelApplying()) {
            throw new BusinessException(ErrorCode.CONFLICT, "顾客正在申请取消，请先处理取消申请");
        }
        orderStateService.transitionOrConflict(order, OrderStatus.MAKING, OrderStatus.READY, OperatorType.MERCHANT, staff.id(), "出餐完成");
        return assembler.merchantDetail(order);
    }

    @Transactional
    public OrderDetail deliver(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        orderStateService.transitionOrConflict(order, OrderStatus.READY, OrderStatus.DONE, OperatorType.MERCHANT, staff.id(), "已送达");
        return assembler.merchantDetail(order);
    }

    /** 整单取消（店主）：制作中 / 待送餐 → 已取消 + 全额退款；已开始制作不回补库存 */
    @Transactional
    public OrderDetail cancel(String orderNo, String reason) {
        // 锁住订单行再判断是否已结账：否则与先吃后付结账并发时，可能按「未结账」取消，钱收了却不退
        Order order = orderStateService.lockByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "请填写取消原因");
        }
        String remark = "商家取消：" + reason.trim();
        OrderStatus from = order.getStatus();
        if (from == OrderStatus.PAID) {
            return reject(orderNo, reason);
        }
        if (from != OrderStatus.MAKING && from != OrderStatus.READY) {
            throw new BusinessException(ErrorCode.CONFLICT, "当前状态不能整单取消");
        }
        boolean unsettled = order.isUnsettled();
        orderStateService.transitionOrConflict(order, from, OrderStatus.CANCELLED, OperatorType.MERCHANT, staff.id(),
                unsettled ? remark + "（先吃后付未结账，无需退款）" : remark);
        if (!unsettled) {
            // 先吃后付还没结账：钱没收，取消即可；已收款的才需要退款
            refundService.refundOrder(order, RefundInitiator.MERCHANT, staff.id(), remark);
        }
        if (order.isCancelApplying()) {
            // 订单已被取消，顾客的取消申请视为同意，不再挂在待处理里
            markCancelHandled(order, Order.CANCEL_APPROVED, null, staff.id());
        }
        return assembler.merchantDetail(order);
    }

    /**
     * 同意顾客的取消申请：已取消 + 全额退回余额，后厨未开始制作所以回补限量库存。
     * 先把申请从 APPLYING 条件更新为 APPROVED，防止前厅与店主同时点击时重复处理。
     */
    @Transactional
    public OrderDetail approveCancelRequest(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        if (order.getStatus() != OrderStatus.MAKING || !order.isCancelApplying()) {
            throw new BusinessException(ErrorCode.CONFLICT, "该取消申请已处理或订单状态已变化，请刷新");
        }
        if (!markCancelHandled(order, Order.CANCEL_APPROVED, null, staff.id())) {
            throw new BusinessException(ErrorCode.CONFLICT, "该取消申请已被处理，请刷新");
        }
        String remark = StringUtils.hasText(order.getCancelRequestReason())
                ? "顾客申请取消，商家同意：" + order.getCancelRequestReason() : "顾客申请取消，商家同意";
        orderStateService.transitionOrConflict(order, OrderStatus.MAKING, OrderStatus.CANCELLED, OperatorType.MERCHANT, staff.id(), remark);
        orderStateService.restoreStock(order.getId());
        refundService.refundOrder(order, RefundInitiator.CUSTOMER, staff.id(), remark);
        return assembler.merchantDetail(orderStateService.getByNo(orderNo));
    }

    /** 拒绝顾客的取消申请：订单继续制作；拒绝理由顾客可见 */
    @Transactional
    public OrderDetail rejectCancelRequest(String orderNo, String reason) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "请填写拒绝理由，顾客会看到");
        }
        if (!order.isCancelApplying() || !markCancelHandled(order, Order.CANCEL_REJECTED, reason.trim(), staff.id())) {
            throw new BusinessException(ErrorCode.CONFLICT, "该取消申请已处理，请刷新");
        }
        return assembler.merchantDetail(orderStateService.getByNo(orderNo));
    }

    /** 条件更新取消申请：只有仍是 APPLYING 时才生效，返回是否更新成功 */
    private boolean markCancelHandled(Order order, String result, String rejectReason, Long staffId) {
        OffsetDateTime now = OffsetDateTime.now();
        int updated = orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                .set(Order::getCancelRequestStatus, result)
                .set(Order::getCancelRejectReason, rejectReason)
                .set(Order::getCancelHandledAt, now)
                .set(Order::getCancelHandledBy, staffId)
                .eq(Order::getId, order.getId())
                .eq(Order::getCancelRequestStatus, Order.CANCEL_APPLYING));
        if (updated > 0) {
            order.setCancelRequestStatus(result);
            order.setCancelRejectReason(rejectReason);
            order.setCancelHandledAt(now);
            order.setCancelHandledBy(staffId);
        }
        return updated > 0;
    }

    /** 商家主动退款 */
    public RefundView refund(String orderNo, MerchantRefundRequest req) {
        Order order = orderStateService.getByNo(orderNo);
        if (order.isUnsettled()) {
            throw new BusinessException(ErrorCode.CONFLICT, "该订单是先吃后付、还没结账，无需退款；如不要了请整单取消");
        }
        return refundService.merchantInitiate(order, req, LoginUser.currentStaff());
    }

    private static List<OrderStatus> parseStatuses(String status) {
        List<OrderStatus> list = new ArrayList<>();
        if (!StringUtils.hasText(status)) {
            return list;
        }
        for (String s : status.split(",")) {
            try {
                list.add(OrderStatus.valueOf(s.trim()));
            } catch (IllegalArgumentException ignored) {
                // 忽略非法值
            }
        }
        return list;
    }
}
