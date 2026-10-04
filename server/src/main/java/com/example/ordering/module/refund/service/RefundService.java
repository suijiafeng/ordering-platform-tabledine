package com.example.ordering.module.refund.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.OrderNoGenerator;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.channel.BalancePayChannel;
import com.example.ordering.module.pay.channel.RefundResult;
import com.example.ordering.module.pay.entity.Payment;
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
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 退款全流程（需求 §8）：
 * <ul>
 *   <li>顾客申请（APPLYING）→ 店主同意 / 拒绝 / 顾客撤回</li>
 *   <li>商家主动 / 系统自动 → 直接 PROCESSING，事务提交后返还余额（{@link BalancePayChannel}）</li>
 *   <li>返还结果：SUCCESS / FAILED；执行出错保持 PROCESSING，由补偿任务按钱包流水查询，
 *       查无返还流水时用同一 refund_no 重新提交（余额返还按单号幂等）</li>
 *   <li>店主对 PROCESSING / FAILED 重试或登记线下退款前，先确认该单确实没有返还成功</li>
 *   <li>已停用的微信 / 支付宝渠道的历史支付单不能线上退款：直接记为失败，由店主登记线下退款</li>
 *   <li>SUCCESS / OFFLINE 时累加 payment.refunded_amount；订单级退款再累加 orders.refunded_amount、
 *       order_item.refunded_qty 并重算 orders.refund_status</li>
 * </ul>
 * 作用域：order_scoped=true 为订单级退款；false 为迟到 / 重复支付的支付单级退款，不占订单可退余额。
 * <p>
 * 并发：部分唯一索引保证同一订单（订单级）/ 同一支付单（支付单级）同一时刻只有一笔
 * APPLYING / PROCESSING / FAILED（uk_refund_order_active、uk_refund_payment_active）；状态更新全部为条件更新。
 * <p>
 * 事务边界：
 * <ul>
 *   <li>创建 / 审核退款：调用方的数据库事务（@Transactional）</li>
 *   <li>返还余额：该事务提交之后（afterCommit），在钱包自己的事务里执行</li>
 *   <li>记录返还结果、店主人工处理：独立新事务（requiresNewTx）</li>
 * </ul>
 */
@Slf4j
@Service
public class RefundService {

    static final String LEGACY_CHANNEL_REASON = "该笔支付来自已停用的微信 / 支付宝渠道，系统无法线上退款：请先到原商户平台核对是否已退款，确认未退再登记线下退款";

    private final RefundMapper refundMapper;
    private final RefundItemMapper refundItemMapper;
    private final OrderMapper orderMapper;
    private final OrderStateService orderStateService;
    private final StoreService storeService;
    private final BalancePayChannel balanceChannel;
    private final RefundCalculator calculator;
    private final RefundLedger ledger;
    private final RefundViewAssembler viewAssembler;
    /** 独立新事务（REQUIRES_NEW）：返还结果回写、店主人工处理时使用，见构造器说明 */
    private final TransactionTemplate requiresNewTx;

    public RefundService(RefundMapper refundMapper, RefundItemMapper refundItemMapper, OrderMapper orderMapper,
                         OrderStateService orderStateService, StoreService storeService,
                         BalancePayChannel balanceChannel, PlatformTransactionManager txManager,
                         RefundCalculator calculator, RefundLedger ledger, RefundViewAssembler viewAssembler) {
        this.calculator = calculator;
        this.ledger = ledger;
        this.viewAssembler = viewAssembler;
        this.refundMapper = refundMapper;
        this.refundItemMapper = refundItemMapper;
        this.orderMapper = orderMapper;
        this.orderStateService = orderStateService;
        this.storeService = storeService;
        this.balanceChannel = balanceChannel;
        // 独立新事务：返还结果回写发生在 afterCommit 等时机，此时线程上仍绑定着已提交事务的连接，
        // REQUIRED 会「加入」那个已结束的事务，写入既不原子也依赖连接的 autoCommit 恢复行为
        this.requiresNewTx = new TransactionTemplate(txManager);
        this.requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ==================== 顾客端 ====================

    /**
     * 顾客申请退款：制作中 / 待送餐 / 已完成（售后时限内）；待接单请走取消订单（自动退款）
     * <p>事务：数据库事务（@Transactional），只建退款申请，不返还余额
     */
    @Transactional
    public RefundView customerApply(Order order, CustomerRefundRequest req) {
        if (!(order.getStatus() == OrderStatus.MAKING || order.getStatus() == OrderStatus.READY
                || order.getStatus() == OrderStatus.DONE)) {
            throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不支持申请退款");
        }
        if (!calculator.withinAfterSaleWindow(order, afterSaleHours(order))) {
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
            amount = calculator.buildItems(orderStateService.items(order.getId()), req.items(), items);
        }
        Refund refund = create(order, type, RefundInitiator.CUSTOMER, amount, req.reason(), null,
                items, RefundStatus.APPLYING);
        return view(refund, order);
    }

    /**
     * 顾客撤回申请：仅 APPLYING
     * <p>事务：数据库事务（@Transactional）
     */
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
        return viewAssembler.views(refunds, Map.of(order.getId(), order));
    }

    /** 顾客端视图：不暴露员工身份与内部错误信息 */
    public List<RefundView> listByOrderForCustomer(Order order) {
        return listByOrder(order).stream().map(RefundView::forCustomer).toList();
    }

    /** 顾客端可否申请退款：状态允许、售后时限内、无进行中的退款、尚有可退余额 */
    public boolean canCustomerApply(Order order) {
        if (!(order.getStatus() == OrderStatus.MAKING || order.getStatus() == OrderStatus.READY
                || order.getStatus() == OrderStatus.DONE)) {
            return false;
        }
        return calculator.withinAfterSaleWindow(order, afterSaleHours(order)) && order.refundableAmount() > 0 && !hasActiveRefund(order.getId());
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
        List<RefundView> views = viewAssembler.views(result.getRecords(), orders);
        return new PageResult<>(views, result.getTotal(), result.getCurrent(), result.getSize());
    }

    public RefundView merchantGet(String refundNo) {
        Refund refund = getByNo(refundNo);
        return view(refund, orderStateService.getById(refund.getOrderId()));
    }

    /**
     * 商家主动退款：FULL / ITEM 任意员工可对 制作中 / 待送餐 / 已完成 订单操作；
     * CUSTOM 仅店主。直接进入 PROCESSING 并返还余额。
     * <p>事务：数据库事务建退款单；返还余额在事务提交之后
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
                yield calculator.buildItems(orderStateService.items(order.getId()), req.items(), items);
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

    /**
     * 店主同意顾客申请 → PROCESSING 并返还余额
     * <p>事务：数据库事务改为 PROCESSING；返还余额在事务提交之后
     */
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

    /** 事务：数据库事务（@Transactional） */
    @Transactional
    public RefundView reject(String refundNo, String reason, Long operatorId) {
        Refund refund = getByNo(refundNo);
        updateStatusOrConflict(refund, RefundStatus.APPLYING, RefundStatus.REJECTED,
                w -> w.set(Refund::getRejectReason, reason).set(Refund::getOperatorId, operatorId));
        return view(refund, orderStateService.getById(refund.getOrderId()));
    }

    /**
     * 重试：沿用同一 refund_no，余额返还按单号幂等。
     * 允许对「处理中」的退款重试，但先按钱包流水确认：已返还则直接记成功；无法确认则拒绝；
     * 查无返还流水才重新提交。这样持续性故障下店主也有出口，又不会重复返还。
     * <p>事务：先查询（事务外），再用独立新事务改状态；返还余额在事务提交之后
     */
    public RefundView retry(String refundNo, Long operatorId) {
        Refund refund = getByNo(refundNo);
        if (refund.getStatus() == RefundStatus.PROCESSING) {
            if (confirmNotRefunded(refund) != null) {
                // 其实已返还：已回写为成功
                return view(refundMapper.selectById(refund.getId()), orderStateService.getById(refund.getOrderId()));
            }
            // 确认没有返还：直接重新提交（状态不变）
            refundMapper.update(null, Wrappers.<Refund>lambdaUpdate()
                    .set(Refund::getFailReason, null).set(Refund::getOperatorId, operatorId)
                    .set(Refund::getUpdatedAt, OffsetDateTime.now()).eq(Refund::getId, refund.getId()));
            executeRefund(refund.getId());
            return view(refundMapper.selectById(refund.getId()), orderStateService.getById(refund.getOrderId()));
        }
        requiresNewTx.executeWithoutResult(st -> {
            updateStatusOrConflict(refund, RefundStatus.FAILED, RefundStatus.PROCESSING,
                    w -> w.set(Refund::getFailReason, null).set(Refund::getOperatorId, operatorId));
            submitAfterCommit(refund);
        });
        return view(refundMapper.selectById(refund.getId()), orderStateService.getById(refund.getOrderId()));
    }

    /**
     * 店主对处理中 / 失败的退款做人工处理前，先确认该单确实没有返还成功。
     * @return 已返还（已回写）时返回该结果；没有返还（查无流水）返回 null；无法确认则抛 409
     */
    private RefundResult confirmNotRefunded(Refund refund) {
        RefundResult result = queryRefundResult(refund);
        switch (result.state()) {
            case SUCCESS -> {
                applyResult(refund, result);
                return result;
            }
            case UNKNOWN -> throw new BusinessException(ErrorCode.CONFLICT, "暂时无法确认退款状态，请稍后再试");
            default -> {
                return null;
            }
        }
    }

    /**
     * 线上退款失败后转线下退款并登记（计入已退金额）。
     * 登记前先确认：其实已返还成功时自动改为退款成功，避免线上线下各退一次。
     * <p>事务：先查询（事务外），再用独立新事务登记线下退款并入账
     */
    public RefundView offline(String refundNo, String remark, Long operatorId) {
        Refund refund = getByNo(refundNo);
        RefundStatus from = refund.getStatus();
        if (from != RefundStatus.FAILED && from != RefundStatus.PROCESSING) {
            throw new BusinessException(ErrorCode.CONFLICT, "退款单状态已变化，请刷新后重试");
        }
        if (confirmNotRefunded(refund) != null) {
            Refund fresh = refundMapper.selectById(refund.getId());
            return view(fresh, orderStateService.getById(fresh.getOrderId()));
        }
        return requiresNewTx.execute(st -> {
            Refund locked = lockRefund(refund.getId());
            if (locked == null || locked.getStatus() != from) {
                throw new BusinessException(ErrorCode.CONFLICT, "退款单状态已变化，请刷新后重试");
            }
            // 锁内再确认一次：补偿任务可能刚好在确认之后返还了余额
            if (payment(refund).getChannel().isBalance()
                    && balanceChannel.queryRefund(refund.getRefundNo()).state() == RefundResult.State.SUCCESS) {
                throw new BusinessException(ErrorCode.CONFLICT, "该退款已返还到会员余额，请刷新查看");
            }
            Order order = orderStateService.getById(refund.getOrderId());
            updateStatusOrConflict(refund, from, RefundStatus.OFFLINE,
                    w -> w.set(Refund::getSuccessAt, OffsetDateTime.now())
                            .set(Refund::getFailReason, truncate("线下退款：" + remark, 255))
                            .set(Refund::getOperatorId, operatorId));
            ledger.applyRefunded(refund, order, null);
            return view(refund, orderStateService.getById(refund.getOrderId()));
        });
    }

    // ==================== 系统 / 内部 ====================

    /**
     * 订单级全额退款：顾客取消待接单订单、商家拒单 / 整单取消、超时未接单。退订单的全部可退余额。
     * <p>事务：加入调用方事务（与订单状态流转一起提交）；返还余额在事务提交后执行。可退余额为 0 时不创建退款单。
     *
     * @param operatorId 操作员工；顾客或系统发起时为 null
     */
    @Transactional
    public Refund refundOrder(Order order, RefundInitiator initiator, Long operatorId, String reason) {
        return createFullRefund(order, null, initiator, operatorId, reason);
    }

    /**
     * 支付单级退款：关单后迟到的支付、重复支付。只退那笔多余的支付单，不占用订单可退余额（order_scoped=false）。
     * <p>事务：加入调用方事务（与支付单入账一起提交）；返还余额在事务提交后执行。
     */
    @Transactional
    public Refund refundExtraPayment(Order order, Payment extraPayment, String reason) {
        return createFullRefund(order, extraPayment, RefundInitiator.SYSTEM, null, reason);
    }

    private Refund createFullRefund(Order order, Payment payment, RefundInitiator initiator, Long operatorId, String reason) {
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

    /**
     * 返还余额并回写结果（事务外调用）
     * <p>事务：返还在钱包自己的事务里执行；结果回写走 applyResult 的独立新事务
     */
    public void executeRefund(Long refundId) {
        Refund refund = refundMapper.selectById(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.PROCESSING) {
            return;
        }
        Order order = orderStateService.getById(refund.getOrderId());
        Payment payment = ledger.paymentOf(refund, order);
        if (payment == null) {
            applyResult(refund, RefundResult.failed("找不到成功的支付记录"));
            return;
        }
        if (!payment.getChannel().isBalance()) {
            applyResult(refund, RefundResult.failed(LEGACY_CHANNEL_REASON));
            return;
        }
        RefundResult result;
        try {
            // 锁住退款单再返还：与店主「登记线下退款」串行，避免一边返还余额、一边线下又退一次
            result = requiresNewTx.execute(st -> {
                Refund locked = lockRefund(refund.getId());
                if (locked == null || locked.getStatus() != RefundStatus.PROCESSING) {
                    return null;  // 已被线下登记 / 已有结果，不再返还
                }
                return balanceChannel.refund(refund.getRefundNo(), payment.getOutTradeNo(), refund.getAmount());
            });
        } catch (RuntimeException e) {
            // 返还出错（如数据库短暂不可用）：可能已经提交，不能判为失败（否则店主可能再线下退一次）。
            // 保持处理中，由补偿任务按钱包流水查询：已返还就回写，查无流水再用同一单号重新提交（幂等）。
            log.warn("退款 {} 返还余额出错，等待补偿查询: {}", refund.getRefundNo(), e.getMessage());
            touch(refund, "退款处理出错，系统将自动重试");
            return;
        }
        if (result != null && result.state() == RefundResult.State.UNKNOWN) {
            touch(refund, "退款结果未确认，系统将自动查询");
        } else if (result != null) {
            applyResult(refund, result);
        }
    }

    /**
     * 按钱包流水查询退款结果（定时补偿）
     * <p>事务：查询无事务；结果回写走 applyResult 的独立新事务
     */
    public void queryAndSync(Refund refund) {
        RefundResult result = queryRefundResult(refund);
        switch (result.state()) {
            case NOT_FOUND -> {
                // 没有返还流水（返还时出错回滚）：用同一退款单号重新提交，按单号幂等
                log.info("退款 {} 查无返还流水，重新提交", refund.getRefundNo());
                executeRefund(refund.getId());
            }
            case UNKNOWN -> {
                touch(refund, null);  // 本轮查不到结果：刷新时间，让其他退款单先被处理
                if (refund.getCreatedAt() != null && refund.getCreatedAt().isBefore(OffsetDateTime.now().minusHours(24))) {
                    log.error("退款 {} 已处理超过 24 小时仍无法确认结果，请人工核对钱包流水", refund.getRefundNo());
                }
            }
            default -> applyResult(refund, result);
        }
    }

    /** 查询退款是否已返还；任何异常都视为结果不明确 */
    private RefundResult queryRefundResult(Refund refund) {
        Order order = orderStateService.getById(refund.getOrderId());
        Payment payment = ledger.paymentOf(refund, order);
        if (payment == null) {
            return RefundResult.notFound();
        }
        if (!payment.getChannel().isBalance()) {
            return RefundResult.notFound();  // 已停用渠道：系统不可能替它退过款
        }
        try {
            return balanceChannel.queryRefund(refund.getRefundNo());
        } catch (RuntimeException e) {
            log.warn("退款 {} 查询失败: {}", refund.getRefundNo(), e.getMessage());
            return RefundResult.unknown();
        }
    }

    /** 在当前事务里锁住退款单行（SELECT ... FOR UPDATE） */
    private Refund lockRefund(Long refundId) {
        return refundMapper.selectOne(Wrappers.<Refund>lambdaQuery().eq(Refund::getId, refundId).last("FOR UPDATE"));
    }

    private Payment payment(Refund refund) {
        Payment p = ledger.paymentOf(refund, orderStateService.getById(refund.getOrderId()));
        if (p == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "找不到该退款对应的支付记录");
        }
        return p;
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

    /**
     * 返还结果回写（幂等：只处理 PROCESSING 状态的退款单）。
     * 调用方都是本类内部（afterCommit 钩子 / 补偿查询），注解事务不会生效，这里用 TransactionTemplate
     * 保证退款单状态与订单 / 支付单记账在同一事务内提交。
     */
    public void applyResult(Refund refund, RefundResult result) {
        if (result == null || result.state() == RefundResult.State.UNKNOWN || result.state() == RefundResult.State.NOT_FOUND) {
            return;
        }
        requiresNewTx.executeWithoutResult(s -> doApplyResult(refund, result));
    }

    private void doApplyResult(Refund refund, RefundResult result) {
        Order order = orderStateService.getById(refund.getOrderId());
        switch (result.state()) {
            case SUCCESS -> {
                java.util.function.Consumer<com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Refund>> set =
                        w -> w.set(Refund::getSuccessAt, OffsetDateTime.now())
                                .set(Refund::getChannelRefundNo, result.channelRefundNo())
                                .set(Refund::getFailReason, null);
                // 以钱包流水为准：已被判为 FAILED 的（例如补偿时发现其实已返还）也纠正为成功
                boolean updated = updateStatus(refund, RefundStatus.PROCESSING, RefundStatus.SUCCESS, set);
                if (!updated && refund.getStatus() == RefundStatus.FAILED) {
                    boolean orderScoped = refund.getOrderScoped() == null || refund.getOrderScoped();
                    if (orderScoped && refund.getAmount() > order.refundableAmount()) {
                        // 期间已有其他退款占用了余额（V3 之前 FAILED 不占名额）：不能再记账，需人工核对
                        log.error("退款 {} 已返还余额，但订单可退余额不足（{} > {}），请人工核对",
                                refund.getRefundNo(), refund.getAmount(), order.refundableAmount());
                        return;
                    }
                    updated = updateStatus(refund, RefundStatus.FAILED, RefundStatus.SUCCESS, set);
                }
                if (updated) {
                    ledger.applyRefunded(refund, order, result.channelRefundNo());
                }
            }
            case FAILED -> updateStatus(refund, RefundStatus.PROCESSING, RefundStatus.FAILED,
                    w -> w.set(Refund::getFailReason, truncate(result.failReason(), 255)));
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
            payment = ledger.firstSuccessPayment(order.getId());
        }
        // 重复支付 / 迟到支付的退款只针对那笔多余的支付单，不占用订单可退余额，也不占订单的进行中退款名额
        boolean orderScoped = ledger.countsForOrder(order, payment);
        // 锁住订单行并重新读取可退余额：调用方拿到的订单可能是事务开始前读的，
        // 并发的另一笔退款可能刚刚成功入账（双击「全额退款」等），用旧值会超退
        Order current = orderMapper.selectOne(Wrappers.<Order>lambdaQuery().eq(Order::getId, order.getId()).last("FOR UPDATE"));
        if (orderScoped && amount > current.refundableAmount()) {
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

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private void submitAfterCommit(Refund refund) {
        Long id = refund.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 业务事务已提交，返还余额的任何异常都不能再抛给调用方（否则接口 500 但数据已落库）
                    try {
                        executeRefund(id);
                    } catch (RuntimeException e) {
                        log.error("退款 {} 返还余额异常，等待补偿任务处理", id, e);
                    }
                }
            });
        } else {
            executeRefund(id);
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

    private int afterSaleHours(Order order) {
        Store store = storeService.getRequired(order.getStoreId());
        return store.getAfterSaleHours() == null ? 24 : store.getAfterSaleHours();
    }

    // ==================== 视图 ====================

    public RefundView view(Refund refund, Order order) {
        return viewAssembler.view(refund, order);
    }
}
