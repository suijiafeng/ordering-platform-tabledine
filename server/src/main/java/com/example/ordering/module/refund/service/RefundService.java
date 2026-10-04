package com.example.ordering.module.refund.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.OrderNoGenerator;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.channel.PayChannel;
import com.example.ordering.module.pay.channel.PayChannelRegistry;
import com.example.ordering.module.pay.channel.RefundChannelRequest;
import com.example.ordering.module.pay.channel.RefundResult;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;
import com.example.ordering.module.pay.mapper.PaymentMapper;
import com.example.ordering.module.refund.dto.CustomerRefundRequest;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.entity.RefundItem;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.entity.RefundType;
import com.example.ordering.module.refund.mapper.RefundItemMapper;
import com.example.ordering.module.refund.mapper.RefundMapper;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.security.LoginUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 退款全流程（需求 §8）：
 * <ul>
 *   <li>顾客申请（APPLYING）→ 店主同意 / 拒绝 / 顾客撤回</li>
 *   <li>商家主动 / 系统自动 → 直接 PROCESSING 并向渠道发起</li>
 *   <li>渠道结果回写：SUCCESS / FAILED；FAILED 可重试（同一 refund_no）或登记线下退款（OFFLINE）</li>
 *   <li>SUCCESS / OFFLINE 时累加 payment.refunded_amount、orders.refunded_amount、order_item.refunded_qty，
 *       并重算 orders.refund_status</li>
 * </ul>
 * 并发：数据库部分唯一索引 uk_refund_order_active 保证同一订单同一时刻只有一笔 APPLYING / PROCESSING；
 * 状态更新全部为条件更新。渠道调用放在事务提交之后执行，避免长事务与「本地已回滚但渠道已退款」的不一致。
 */
@Slf4j
@Service
public class RefundService {

    private final RefundMapper refundMapper;
    private final RefundItemMapper refundItemMapper;
    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final PaymentMapper paymentMapper;
    private final StaffMapper staffMapper;
    private final OrderStateService orderStateService;
    private final StoreService storeService;
    private final PayChannelRegistry channels;
    private final TransactionTemplate tx;
    private final String notifyBaseUrl;

    public RefundService(RefundMapper refundMapper, RefundItemMapper refundItemMapper, OrderMapper orderMapper,
                         OrderItemMapper orderItemMapper, PaymentMapper paymentMapper, StaffMapper staffMapper,
                         OrderStateService orderStateService, StoreService storeService,
                         PayChannelRegistry channels, PlatformTransactionManager txManager, AppProperties appProperties) {
        this.refundMapper = refundMapper;
        this.refundItemMapper = refundItemMapper;
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.paymentMapper = paymentMapper;
        this.staffMapper = staffMapper;
        this.orderStateService = orderStateService;
        this.storeService = storeService;
        this.channels = channels;
        // 独立新事务：渠道结果回写发生在 afterCommit 等时机，此时线程上仍绑定着已提交事务的连接，
        // REQUIRED 会「加入」那个已结束的事务，写入既不原子也依赖连接的 autoCommit 恢复行为
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.notifyBaseUrl = appProperties.getPay().getNotifyBaseUrl();
    }

    // ==================== 顾客端 ====================

    /** 顾客申请退款：制作中 / 待送餐 / 已完成（售后时限内）；待接单请走取消订单（自动退款） */
    @Transactional
    public RefundView customerApply(Order order, CustomerRefundRequest req) {
        if (!(order.getStatus() == OrderStatus.MAKING || order.getStatus() == OrderStatus.READY
                || order.getStatus() == OrderStatus.DONE)) {
            throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不支持申请退款");
        }
        if (!withinAfterSaleWindow(order)) {
            throw new BusinessException(ErrorCode.CONFLICT, "已超过售后申请时限");
        }
        List<RefundItem> items = new ArrayList<>();
        long amount;
        RefundType type;
        if (req.items() == null || req.items().isEmpty()) {
            type = RefundType.FULL;
            amount = order.refundableAmount();
        } else {
            type = RefundType.ITEM;
            amount = buildItems(order, req.items(), items);
        }
        Refund refund = create(order, type, RefundInitiator.CUSTOMER, amount, req.reason(), null,
                items, RefundStatus.APPLYING);
        return view(refund, order);
    }

    /** 顾客撤回申请：仅 APPLYING */
    @Transactional
    public RefundView customerWithdraw(String refundNo, Long customerId) {
        Refund refund = getByNo(refundNo);
        Order order = orderStateService.getById(refund.getOrderId());
        if (!order.getCustomerId().equals(customerId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "退款单不存在");
        }
        updateStatusOrConflict(refund, RefundStatus.APPLYING, RefundStatus.WITHDRAWN, null);
        return view(refund, order);
    }

    public List<RefundView> listByOrder(Order order) {
        List<Refund> refunds = refundMapper.selectList(Wrappers.<Refund>lambdaQuery()
                .eq(Refund::getOrderId, order.getId()).orderByDesc(Refund::getId));
        return views(refunds, Map.of(order.getId(), order));
    }

    /** 顾客端可否申请退款：状态允许、售后时限内、无进行中的退款、尚有可退余额 */
    public boolean canCustomerApply(Order order) {
        if (!(order.getStatus() == OrderStatus.MAKING || order.getStatus() == OrderStatus.READY
                || order.getStatus() == OrderStatus.DONE)) {
            return false;
        }
        return withinAfterSaleWindow(order) && order.refundableAmount() > 0 && !hasActiveRefund(order.getId());
    }

    // ==================== 商家端 ====================

    public PageResult<RefundView> merchantList(String status, int page, int pageSize) {
        var query = Wrappers.<Refund>lambdaQuery().orderByDesc(Refund::getId);
        if (StringUtils.hasText(status)) {
            List<RefundStatus> statuses = new ArrayList<>();
            for (String s : status.split(",")) {
                try {
                    statuses.add(RefundStatus.valueOf(s.trim()));
                } catch (IllegalArgumentException ignored) {
                    // 忽略非法状态值
                }
            }
            if (!statuses.isEmpty()) {
                query.in(Refund::getStatus, statuses);
            }
        }
        Page<Refund> result = refundMapper.selectPage(new Page<>(page, pageSize), query);
        List<Long> orderIds = result.getRecords().stream().map(Refund::getOrderId).distinct().toList();
        Map<Long, Order> orders = orderIds.isEmpty() ? Map.of()
                : orderMapper.selectBatchIds(orderIds).stream().collect(Collectors.toMap(Order::getId, Function.identity()));
        List<RefundView> views = views(result.getRecords(), orders);
        return new PageResult<>(views, result.getTotal(), result.getCurrent(), result.getSize());
    }

    public RefundView merchantGet(String refundNo) {
        Refund refund = getByNo(refundNo);
        return view(refund, orderStateService.getById(refund.getOrderId()));
    }

    /**
     * 商家主动退款：FULL / ITEM 任意员工可对 制作中 / 待送餐 / 已完成 订单操作；
     * CUSTOM 仅店主。直接进入 PROCESSING 并向渠道发起。
     */
    @Transactional
    public RefundView merchantInitiate(Order order, MerchantRefundRequest req, LoginUser staff) {
        if (order.getStatus() == OrderStatus.PAID) {
            // 待接单订单只退款不改状态会让后厨继续接单制作，必须走拒单（取消 + 全额退款 + 回补库存）
            throw new BusinessException(ErrorCode.CONFLICT, "待接单订单请使用拒单，将自动全额退款");
        }
        if (!(order.getStatus().isActivePaid() || order.getStatus() == OrderStatus.DONE)) {
            throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不支持退款");
        }
        // 需求 §4：商家主动退款仅店主（拒单产生的退款除外，走 reject）
        if (!staff.isOwner()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "主动退款仅店主可操作");
        }
        List<RefundItem> items = new ArrayList<>();
        long amount = switch (req.type()) {
            case FULL -> order.refundableAmount();
            case ITEM -> {
                if (req.items() == null || req.items().isEmpty()) {
                    throw new BusinessException(ErrorCode.PARAM_INVALID, "请选择退款菜品");
                }
                yield buildItems(order, req.items(), items);
            }
            case CUSTOM -> {
                if (req.amount() == null) {
                    throw new BusinessException(ErrorCode.PARAM_INVALID, "请填写退款金额");
                }
                yield req.amount();
            }
        };
        Refund refund = create(order, req.type(), RefundInitiator.MERCHANT, amount, req.reason(), staff.id(),
                items, RefundStatus.PROCESSING);
        submitAfterCommit(refund);
        return view(refund, order);
    }

    /** 店主同意顾客申请 → PROCESSING 并向渠道发起 */
    @Transactional
    public RefundView approve(String refundNo, Long operatorId) {
        Refund refund = getByNo(refundNo);
        Order order = orderStateService.getById(refund.getOrderId());
        // 审核时再次校验可退余额（期间可能发生过其他退款）
        if (refund.getAmount() > order.refundableAmount()) {
            throw new BusinessException(ErrorCode.REFUND_AMOUNT_EXCEEDED);
        }
        updateStatusOrConflict(refund, RefundStatus.APPLYING, RefundStatus.PROCESSING,
                w -> w.set(Refund::getOperatorId, operatorId));
        submitAfterCommit(refund);
        return view(refund, order);
    }

    @Transactional
    public RefundView reject(String refundNo, String reason, Long operatorId) {
        Refund refund = getByNo(refundNo);
        updateStatusOrConflict(refund, RefundStatus.APPLYING, RefundStatus.REJECTED,
                w -> w.set(Refund::getRejectReason, reason).set(Refund::getOperatorId, operatorId));
        return view(refund, orderStateService.getById(refund.getOrderId()));
    }

    /** 失败重试：沿用同一 refund_no，渠道按单号幂等 */
    @Transactional
    public RefundView retry(String refundNo, Long operatorId) {
        Refund refund = getByNo(refundNo);
        updateStatusOrConflict(refund, RefundStatus.FAILED, RefundStatus.PROCESSING,
                w -> w.set(Refund::getFailReason, null).set(Refund::getOperatorId, operatorId));
        submitAfterCommit(refund);
        return view(refund, orderStateService.getById(refund.getOrderId()));
    }

    /**
     * 线上退款失败后转线下退款并登记（计入已退金额）。
     * 登记前先向渠道确认：渠道其实已退成功（例如结果通知晚到）时自动改为退款成功，避免线上线下各退一次。
     */
    public RefundView offline(String refundNo, String remark, Long operatorId) {
        Refund refund = getByNo(refundNo);
        if (refund.getStatus() != RefundStatus.FAILED) {
            throw new BusinessException(ErrorCode.CONFLICT, "退款单状态已变化，请刷新后重试");
        }
        RefundResult channel = queryChannel(refund);
        switch (channel.state()) {
            case SUCCESS -> {
                applyResult(refund, channel);
                Refund fresh = refundMapper.selectById(refund.getId());
                return view(fresh, orderStateService.getById(fresh.getOrderId()));
            }
            case PROCESSING -> throw new BusinessException(ErrorCode.CONFLICT, "渠道显示该退款仍在处理中，请稍后再试");
            case UNKNOWN -> throw new BusinessException(ErrorCode.CONFLICT, "暂时无法确认渠道退款状态，请稍后再试");
            default -> { /* FAILED / NOT_FOUND：渠道确实没有退款，可以线下退 */ }
        }
        return tx.execute(st -> {
            Order order = orderStateService.getById(refund.getOrderId());
            updateStatusOrConflict(refund, RefundStatus.FAILED, RefundStatus.OFFLINE,
                    w -> w.set(Refund::getSuccessAt, OffsetDateTime.now())
                            .set(Refund::getFailReason, truncate("线下退款：" + remark, 255))
                            .set(Refund::getOperatorId, operatorId));
            applyRefunded(refund, order, null);
            return view(refund, orderStateService.getById(refund.getOrderId()));
        });
    }

    // ==================== 系统 / 内部 ====================

    /**
     * 全额退款（顾客取消待接单订单、商家拒单 / 整单取消、超时未接单、迟到支付、重复支付）。
     * 直接 PROCESSING 并在事务提交后向渠道发起。可退余额为 0 时不创建退款单。
     */
    @Transactional
    public Refund fullRefund(Order order, Payment payment, RefundInitiator initiator, Long operatorId, String reason) {
        long amount = payment != null
                ? payment.getAmount() - (payment.getRefundedAmount() == null ? 0 : payment.getRefundedAmount())
                : order.refundableAmount();
        if (amount <= 0) {
            return null;
        }
        Refund refund = create(order, RefundType.FULL, initiator, amount, reason, operatorId, List.of(),
                RefundStatus.PROCESSING, payment);
        submitAfterCommit(refund);
        return refund;
    }

    /** 向渠道发起退款并回写结果（事务外调用） */
    public void submitToChannel(Long refundId) {
        Refund refund = refundMapper.selectById(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.PROCESSING) {
            return;
        }
        Order order = orderStateService.getById(refund.getOrderId());
        Payment payment = successPayment(refund, order);
        if (payment == null) {
            applyResult(refund, RefundResult.failed("找不到成功的支付记录"));
            return;
        }
        PayChannel channel = channels.get(payment.getChannel());
        RefundResult result;
        try {
            result = channel.refund(new RefundChannelRequest(refund.getRefundNo(), payment.getOutTradeNo(),
                    payment.getTransactionNo(), refund.getAmount(), payment.getAmount(), refund.getReason(),
                    notifyBaseUrl + "/api/v1/pay/notify/wechat-refund"));
        } catch (RuntimeException e) {
            // 渠道调用异常（超时 / 5xx）：渠道可能已经受理并退款，绝不能判为失败（否则店主可能再线下退一次）。
            // 保持处理中，由补偿任务查询：查到结果就回写，查无此单再用同一单号重新提交（渠道幂等）。
            log.warn("退款 {} 渠道调用异常，等待补偿查询: {}", refund.getRefundNo(), e.getMessage());
            touch(refund, "渠道调用异常，系统将自动重试");
            return;
        }
        if (result == null || result.state() == RefundResult.State.UNKNOWN) {
            touch(refund, "渠道结果未确认，系统将自动查询");
            return;
        }
        applyResult(refund, result);
    }

    /** 主动查询渠道退款结果（定时补偿） */
    public void queryAndSync(Refund refund) {
        RefundResult result = queryChannel(refund);
        switch (result.state()) {
            case NOT_FOUND -> {
                // 渠道没收到这笔退款（请求没到达 / 支付宝未受理）：用同一退款单号重新提交，渠道按单号幂等
                log.info("退款 {} 渠道查无此单，重新提交", refund.getRefundNo());
                submitToChannel(refund.getId());
            }
            case UNKNOWN -> {
                touch(refund, null);  // 本轮查不到结果：刷新时间，让其他退款单先被处理
                if (refund.getCreatedAt() != null && refund.getCreatedAt().isBefore(OffsetDateTime.now().minusHours(24))) {
                    log.error("退款 {} 已处理超过 24 小时仍无法确认结果，请人工到渠道商户平台核对", refund.getRefundNo());
                }
            }
            case PROCESSING -> {
                applyResult(refund, result);
                touch(refund, null);
            }
            default -> applyResult(refund, result);
        }
    }

    /** 查询渠道侧退款状态；任何异常都视为结果不明确 */
    private RefundResult queryChannel(Refund refund) {
        Order order = orderStateService.getById(refund.getOrderId());
        Payment payment = successPayment(refund, order);
        if (payment == null) {
            return RefundResult.notFound();
        }
        try {
            RefundResult r = channels.get(payment.getChannel()).queryRefund(refund.getRefundNo(), payment.getOutTradeNo());
            return r == null ? RefundResult.unknown() : r;
        } catch (RuntimeException e) {
            log.warn("退款 {} 查询失败: {}", refund.getRefundNo(), e.getMessage());
            return RefundResult.unknown();
        }
    }

    /** 刷新处理中退款单的 updated_at（补偿任务按它轮转），可选记录提示 */
    private void touch(Refund refund, String note) {
        var w = Wrappers.<Refund>lambdaUpdate()
                .set(Refund::getUpdatedAt, OffsetDateTime.now())
                .eq(Refund::getId, refund.getId())
                .eq(Refund::getStatus, RefundStatus.PROCESSING);
        if (note != null) {
            w.set(Refund::getFailReason, note);
        }
        refundMapper.update(null, w);
    }

    /** 微信退款结果通知 */
    public void onRefundNotify(String refundNo, RefundResult result) {
        Refund refund = refundMapper.selectOne(Wrappers.<Refund>lambdaQuery().eq(Refund::getRefundNo, refundNo));
        if (refund == null) {
            log.warn("收到未知退款单的通知: {}", refundNo);
            return;
        }
        applyResult(refund, result);
    }

    /**
     * 渠道结果回写（幂等：只处理 PROCESSING 状态的退款单）。
     * 调用方都是本类内部（afterCommit 钩子 / 补偿查询 / 回调），注解事务不会生效，这里用 TransactionTemplate
     * 保证退款单状态与订单 / 支付单记账在同一事务内提交。
     */
    public void applyResult(Refund refund, RefundResult result) {
        if (result == null || result.state() == RefundResult.State.UNKNOWN || result.state() == RefundResult.State.NOT_FOUND) {
            return;
        }
        tx.executeWithoutResult(s -> doApplyResult(refund, result));
    }

    private void doApplyResult(Refund refund, RefundResult result) {
        Order order = orderStateService.getById(refund.getOrderId());
        switch (result.state()) {
            case SUCCESS -> {
                java.util.function.Consumer<com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Refund>> set =
                        w -> w.set(Refund::getSuccessAt, OffsetDateTime.now())
                                .set(Refund::getChannelRefundNo, result.channelRefundNo())
                                .set(Refund::getFailReason, null);
                // 渠道的成功以渠道为准：已被判为 FAILED 的（例如成功通知晚于失败结论）也纠正为成功
                boolean updated = updateStatus(refund, RefundStatus.PROCESSING, RefundStatus.SUCCESS, set)
                        || updateStatus(refund, RefundStatus.FAILED, RefundStatus.SUCCESS, set);
                if (updated) {
                    applyRefunded(refund, order, result.channelRefundNo());
                }
            }
            case FAILED -> updateStatus(refund, RefundStatus.PROCESSING, RefundStatus.FAILED,
                    w -> w.set(Refund::getFailReason, truncate(result.failReason(), 255)));
            case PROCESSING -> {
                if (StringUtils.hasText(result.channelRefundNo())) {
                    refundMapper.update(null, Wrappers.<Refund>lambdaUpdate()
                            .set(Refund::getChannelRefundNo, result.channelRefundNo())
                            .eq(Refund::getId, refund.getId()));
                }
            }
            default -> { }
        }
    }

    public List<Refund> processingOlderThan(OffsetDateTime before) {
        return refundMapper.selectList(Wrappers.<Refund>lambdaQuery()
                .eq(Refund::getStatus, RefundStatus.PROCESSING)
                .lt(Refund::getUpdatedAt, before)
                .orderByAsc(Refund::getUpdatedAt)  // 每轮处理后会刷新 updated_at，避免同一批卡住的单永远排在最前
                .last("LIMIT 100"));
    }

    public List<Refund> applyingOlderThan(OffsetDateTime before) {
        return refundMapper.selectList(Wrappers.<Refund>lambdaQuery()
                .eq(Refund::getStatus, RefundStatus.APPLYING)
                .lt(Refund::getCreatedAt, before)
                .orderByAsc(Refund::getId)
                .last("LIMIT 100"));
    }

    /** 订单级进行中退款（与 uk_refund_order_active 一致；支付单级自动退款不占名额） */
    public boolean hasActiveRefund(Long orderId) {
        return refundMapper.selectCount(Wrappers.<Refund>lambdaQuery()
                .eq(Refund::getOrderId, orderId)
                .eq(Refund::getOrderScoped, true)
                .in(Refund::getStatus, RefundStatus.APPLYING, RefundStatus.PROCESSING, RefundStatus.FAILED)) > 0;
    }

    public Refund getByNo(String refundNo) {
        Refund refund = StringUtils.hasText(refundNo)
                ? refundMapper.selectOne(Wrappers.<Refund>lambdaQuery().eq(Refund::getRefundNo, refundNo))
                : null;
        if (refund == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "退款单不存在");
        }
        return refund;
    }

    // ==================== 内部 ====================

    private Refund create(Order order, RefundType type, RefundInitiator initiator, long amount, String reason,
                          Long operatorId, List<RefundItem> items, RefundStatus status) {
        return create(order, type, initiator, amount, reason, operatorId, items, status, null);
    }

    private Refund create(Order order, RefundType type, RefundInitiator initiator, long amount, String reason,
                          Long operatorId, List<RefundItem> items, RefundStatus status, Payment payment) {
        if (amount <= 0) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "退款金额必须大于 0");
        }
        if (payment == null) {
            payment = firstSuccessPayment(order.getId());
        }
        // 重复支付 / 迟到支付的退款只针对那笔多余的支付单，不占用订单可退余额，也不占订单的进行中退款名额
        boolean orderScoped = countsForOrder(order, payment);
        if (orderScoped && amount > order.refundableAmount()) {
            throw new BusinessException(ErrorCode.REFUND_AMOUNT_EXCEEDED);
        }
        if (orderScoped && hasActiveRefund(order.getId())) {
            throw new BusinessException(ErrorCode.REFUND_IN_PROGRESS);
        }
        if (!orderScoped && payment != null && amount > payment.getAmount() - (payment.getRefundedAmount() == null ? 0 : payment.getRefundedAmount())) {
            throw new BusinessException(ErrorCode.REFUND_AMOUNT_EXCEEDED);
        }
        Refund refund = new Refund();
        refund.setRefundNo(OrderNoGenerator.refundNo());
        refund.setStoreId(order.getStoreId());
        refund.setOrderId(order.getId());
        refund.setPaymentId(payment == null ? null : payment.getId());
        refund.setOrderScoped(orderScoped);
        refund.setType(type);
        refund.setInitiator(initiator);
        refund.setAmount(amount);
        refund.setReason(reason);
        refund.setStatus(status);
        refund.setOperatorId(operatorId);
        refund.setVersion(0);
        try {
            refundMapper.insert(refund);
        } catch (DuplicateKeyException e) {
            // uk_refund_order_active：并发下同一订单已有进行中的退款
            throw new BusinessException(ErrorCode.REFUND_IN_PROGRESS);
        }
        for (RefundItem item : items) {
            item.setRefundId(refund.getId());
            refundItemMapper.insert(item);
        }
        return refund;
    }

    /** 校验按菜品退款的明细并计算金额 */
    private long buildItems(Order order, List<CustomerRefundRequest.ItemInput> inputs, List<RefundItem> out) {
        Map<Long, OrderItem> items = orderStateService.items(order.getId()).stream()
                .collect(Collectors.toMap(OrderItem::getId, Function.identity()));
        Map<Long, Integer> merged = new LinkedHashMap<>();
        for (CustomerRefundRequest.ItemInput in : inputs) {
            merged.merge(in.orderItemId(), in.quantity(), Integer::sum);
        }
        long total = 0;
        for (Map.Entry<Long, Integer> e : merged.entrySet()) {
            OrderItem item = items.get(e.getKey());
            if (item == null) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "退款菜品不属于该订单");
            }
            if (e.getValue() > item.refundableQty()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID,
                        "「" + item.getDishName() + "」可退数量不足（可退 " + item.refundableQty() + " 份）");
            }
            RefundItem ri = new RefundItem();
            ri.setOrderItemId(item.getId());
            ri.setQuantity(e.getValue());
            ri.setAmount(item.getUnitPrice() * e.getValue());
            out.add(ri);
            total += ri.getAmount();
        }
        return total;
    }

    private boolean withinAfterSaleWindow(Order order) {
        if (order.getStatus() != OrderStatus.DONE) {
            return true;
        }
        Store store = storeService.getRequired(order.getStoreId());
        int hours = store.getAfterSaleHours() == null ? 24 : store.getAfterSaleHours();
        return order.getCreatedAt().plusHours(hours).isAfter(OffsetDateTime.now());
    }

    private Payment successPayment(Refund refund, Order order) {
        if (refund.getPaymentId() != null) {
            Payment p = paymentMapper.selectById(refund.getPaymentId());
            if (p != null) {
                return p;
            }
        }
        return firstSuccessPayment(order.getId());
    }

    /** 订单最早的一笔成功支付 = 订单实际入账的那笔；其后的成功支付都是重复支付 */
    private Payment firstSuccessPayment(Long orderId) {
        return paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, PaymentStatus.SUCCESS)
                .orderByAsc(Payment::getId)
                .last("LIMIT 1"));
    }

    /**
     * 该退款是否计入订单的已退金额 / 退款状态。
     * 已关闭订单的迟到支付、以及重复支付的那笔，退的是订单之外的多余款项，不动订单记账。
     */
    private boolean countsForOrder(Order order, Payment payment) {
        if (payment == null) {
            return true;
        }
        if (order.getStatus() == OrderStatus.CLOSED) {
            return false;
        }
        Payment first = firstSuccessPayment(order.getId());
        return first == null || first.getId().equals(payment.getId());
    }

    /** 退款成功 / 线下登记后累加已退金额并重算订单退款状态 */
    private void applyRefunded(Refund refund, Order order, String channelRefundNo) {
        long amount = refund.getAmount();
        Payment payment = refund.getPaymentId() == null ? null : paymentMapper.selectById(refund.getPaymentId());
        if (payment != null) {
            paymentMapper.update(null, Wrappers.<Payment>lambdaUpdate()
                    .setSql("refunded_amount = refunded_amount + " + amount)
                    .set(Payment::getUpdatedAt, OffsetDateTime.now())
                    .eq(Payment::getId, payment.getId()));
        }
        boolean orderScoped = refund.getOrderScoped() == null || refund.getOrderScoped();
        if (orderScoped) {
            // 在一条 UPDATE 里累加并重算状态（SET 中引用的列是更新前的值），避免并发退款下按内存旧值算错
            orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                    .setSql("refunded_amount = refunded_amount + " + amount)
                    .setSql("refund_status = CASE WHEN refunded_amount + " + amount + " >= pay_amount THEN 'FULL' ELSE 'PARTIAL' END")
                    .set(Order::getUpdatedAt, OffsetDateTime.now())
                    .eq(Order::getId, order.getId()));
            for (RefundItem ri : refundItemMapper.selectList(Wrappers.<RefundItem>lambdaQuery().eq(RefundItem::getRefundId, refund.getId()))) {
                orderItemMapper.update(null, Wrappers.<OrderItem>lambdaUpdate()
                        .setSql("refunded_qty = refunded_qty + " + ri.getQuantity())
                        .eq(OrderItem::getId, ri.getOrderItemId()));
            }
            Order fresh = orderMapper.selectById(order.getId());
            order.setRefundedAmount(fresh.getRefundedAmount());
            order.setRefundStatus(fresh.getRefundStatus());
        }
        refund.setStatus(refund.getStatus() == RefundStatus.OFFLINE ? RefundStatus.OFFLINE : RefundStatus.SUCCESS);
        refund.setChannelRefundNo(channelRefundNo);
        refund.setSuccessAt(OffsetDateTime.now());
        log.info("订单 {} 退款 {} 已完成 金额={} 累计已退={} 退款状态={}", order.getOrderNo(), refund.getRefundNo(), amount,
                order.getRefundedAmount(), order.getRefundStatus());
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private void submitAfterCommit(Refund refund) {
        Long id = refund.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 业务事务已提交，渠道调用的任何异常都不能再抛给调用方（否则接口 500 但数据已落库）
                    try {
                        submitToChannel(id);
                    } catch (RuntimeException e) {
                        log.error("退款 {} 提交渠道异常，等待补偿任务处理", id, e);
                    }
                }
            });
        } else {
            submitToChannel(id);
        }
    }

    private boolean updateStatus(Refund refund, RefundStatus from, RefundStatus to,
                                 java.util.function.Consumer<com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Refund>> extra) {
        var w = Wrappers.<Refund>lambdaUpdate()
                .set(Refund::getStatus, to)
                .set(Refund::getUpdatedAt, OffsetDateTime.now())
                .setSql("version = version + 1")
                .eq(Refund::getId, refund.getId())
                .eq(Refund::getStatus, from);
        if (extra != null) {
            extra.accept(w);
        }
        boolean ok = refundMapper.update(null, w) > 0;
        if (ok) {
            refund.setStatus(to);
        }
        return ok;
    }

    private void updateStatusOrConflict(Refund refund, RefundStatus from, RefundStatus to,
                                        java.util.function.Consumer<com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Refund>> extra) {
        if (!updateStatus(refund, from, to, extra)) {
            throw new BusinessException(ErrorCode.CONFLICT, "退款单状态已变化，请刷新后重试");
        }
        // 刷新内存对象
        Refund fresh = refundMapper.selectById(refund.getId());
        if (fresh != null) {
            refund.setStatus(fresh.getStatus());
            refund.setRejectReason(fresh.getRejectReason());
            refund.setFailReason(fresh.getFailReason());
            refund.setOperatorId(fresh.getOperatorId());
            refund.setSuccessAt(fresh.getSuccessAt());
        }
    }

    // ==================== 视图 ====================

    public RefundView view(Refund refund, Order order) {
        return views(List.of(refund), Map.of(order.getId(), order)).get(0);
    }

    public List<RefundView> views(List<Refund> refunds, Map<Long, Order> orders) {
        if (refunds.isEmpty()) {
            return List.of();
        }
        List<Long> refundIds = refunds.stream().map(Refund::getId).toList();
        Map<Long, List<RefundItem>> itemsByRefund = refundItemMapper.selectList(Wrappers.<RefundItem>lambdaQuery()
                        .in(RefundItem::getRefundId, refundIds)).stream()
                .collect(Collectors.groupingBy(RefundItem::getRefundId));
        List<Long> orderItemIds = itemsByRefund.values().stream().flatMap(Collection::stream)
                .map(RefundItem::getOrderItemId).distinct().toList();
        Map<Long, OrderItem> orderItems = orderItemIds.isEmpty() ? Map.of()
                : orderItemMapper.selectBatchIds(orderItemIds).stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
        Map<Long, String> staffNames = staffNames(refunds.stream().map(Refund::getOperatorId).filter(java.util.Objects::nonNull).distinct().toList());

        List<RefundView> result = new ArrayList<>();
        for (Refund r : refunds) {
            Order order = orders.get(r.getOrderId());
            List<RefundView.RefundItemView> items = itemsByRefund.getOrDefault(r.getId(), List.of()).stream()
                    .map(ri -> {
                        OrderItem oi = orderItems.get(ri.getOrderItemId());
                        return new RefundView.RefundItemView(ri.getOrderItemId(),
                                oi == null ? "-" : oi.getDishName(), oi == null ? null : oi.getSpecDesc(),
                                ri.getQuantity(), ri.getAmount());
                    }).toList();
            result.add(new RefundView(r.getId(), r.getRefundNo(), order == null ? null : order.getOrderNo(),
                    order == null ? null : order.getTableCode(), r.getType(), r.getInitiator(), r.getAmount(),
                    r.getReason(), r.getRejectReason(), r.getStatus(), r.getFailReason(), r.getChannelRefundNo(),
                    r.getOperatorId(), staffNames.get(r.getOperatorId()), r.getCreatedAt(), r.getSuccessAt(), items));
        }
        return result;
    }

    /** 员工 ID → 姓名。返回 HashMap（允许 get(null)，系统 / 顾客操作的 operatorId 为空） */
    public Map<Long, String> staffNames(Collection<Long> staffIds) {
        Map<Long, String> names = new HashMap<>();
        if (staffIds == null || staffIds.isEmpty()) {
            return names;
        }
        for (Staff s : staffMapper.selectBatchIds(staffIds)) {
            names.put(s.getId(), s.getName());
        }
        return names;
    }
}
