package com.example.ordering.module.pay.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.customer.entity.CustomerAuth;
import com.example.ordering.module.customer.mapper.CustomerAuthMapper;
import com.example.ordering.module.order.dto.PayInitResult;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.channel.PayChannel;
import com.example.ordering.module.pay.channel.PayChannelRegistry;
import com.example.ordering.module.pay.channel.PayCreateRequest;
import com.example.ordering.module.pay.channel.PayQueryResult;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;
import com.example.ordering.module.pay.mapper.PaymentMapper;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 支付门面：发起支付、支付成功入账（回调 / 查单 / Mock 共用）、关单、查单补偿。
 * <p>
 * 入账规则（需求 §7.3 / §16）：
 * <ul>
 *   <li>按 out_trade_no 幂等：支付单已 SUCCESS 直接返回</li>
 *   <li>金额与支付单不一致：拒绝入账并告警</li>
 *   <li>订单待支付 → 已支付（自动接单则直接制作中）</li>
 *   <li>订单已关闭（迟到回调）或已被另一笔支付成功（重复支付）→ 该笔支付自动全额退款</li>
 * </ul>
 */
@Slf4j
@Service
public class PayService {

    private final PaymentMapper paymentMapper;
    private final CustomerAuthMapper customerAuthMapper;
    private final OrderStateService orderStateService;
    private final RefundService refundService;
    private final StoreService storeService;
    private final PayChannelRegistry channels;
    private final TransactionTemplate tx;
    private final String notifyBaseUrl;

    public PayService(PaymentMapper paymentMapper, CustomerAuthMapper customerAuthMapper,
                      OrderStateService orderStateService, RefundService refundService, StoreService storeService,
                      PayChannelRegistry channels, TransactionTemplate tx, AppProperties appProperties) {
        this.paymentMapper = paymentMapper;
        this.customerAuthMapper = customerAuthMapper;
        this.orderStateService = orderStateService;
        this.refundService = refundService;
        this.storeService = storeService;
        this.channels = channels;
        this.tx = tx;
        this.notifyBaseUrl = appProperties.getPay().getNotifyBaseUrl();
    }

    // ==================== 发起支付 ====================

    /** 为待支付订单发起（或复用）一笔支付，返回拉起参数 */
    @Transactional
    public PayInitResult initiate(Order order) {
        if (order.getStatus() != OrderStatus.PENDING_PAY) {
            throw new BusinessException(ErrorCode.CONFLICT, "订单当前不可支付");
        }
        if (order.getPayExpireAt().isBefore(OffsetDateTime.now())) {
            throw new BusinessException(ErrorCode.CONFLICT, "订单已超时，请重新下单");
        }
        Platform channel = order.getPlatform();
        Payment payment = paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, order.getId())
                .eq(Payment::getChannel, channel)
                .eq(Payment::getStatus, PaymentStatus.PENDING)
                .orderByDesc(Payment::getId)
                .last("LIMIT 1"));
        if (payment == null) {
            long attempts = paymentMapper.selectCount(Wrappers.<Payment>lambdaQuery().eq(Payment::getOrderId, order.getId()));
            payment = new Payment();
            payment.setOrderId(order.getId());
            payment.setOutTradeNo(attempts == 0 ? order.getOrderNo() : order.getOrderNo() + "P" + (attempts + 1));
            payment.setChannel(channel);
            payment.setAmount(order.getPayAmount());
            payment.setStatus(PaymentStatus.PENDING);
            payment.setRefundedAmount(0L);
            paymentMapper.insert(payment);
        }
        Store store = storeService.getRequired(order.getStoreId());
        String description = store.getName() + (order.getTableCode() == null ? "" : " 桌号" + order.getTableCode());
        String openId = openId(order.getCustomerId(), channel);
        PayChannel pc = channels.get(channel);
        Map<String, Object> params = pc.createPayment(new PayCreateRequest(payment.getOutTradeNo(),
                payment.getAmount(), description, openId, order.getPayExpireAt(),
                notifyBaseUrl + "/api/v1/pay/notify/" + channel.name().toLowerCase()));
        return new PayInitResult(order.getOrderNo(), payment.getOutTradeNo(), channel, payment.getAmount(),
                channels.isMock(), params);
    }

    private String openId(Long customerId, Platform platform) {
        CustomerAuth auth = customerAuthMapper.selectOne(Wrappers.<CustomerAuth>lambdaQuery()
                .eq(CustomerAuth::getCustomerId, customerId)
                .eq(CustomerAuth::getPlatform, platform)
                .last("LIMIT 1"));
        if (auth == null || !StringUtils.hasText(auth.getOpenId())) {
            throw new BusinessException(ErrorCode.CONFLICT, "未找到顾客在该平台的支付账号，请重新登录");
        }
        return auth.getOpenId();
    }

    // ==================== 入账 ====================

    /**
     * 支付成功入账（回调、查单补偿、Mock 共用）。
     *
     * @return 是否接受该通知（false 表示金额不符等需渠道重发 / 人工处理的情况）
     */
    @Transactional
    public boolean onPaySuccess(String outTradeNo, String transactionNo, long amount, OffsetDateTime paidAt) {
        Payment payment = paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery().eq(Payment::getOutTradeNo, outTradeNo));
        if (payment == null) {
            log.warn("收到未知商户单号的支付成功通知: {}", outTradeNo);
            return false;
        }
        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            return true;  // 重复通知，幂等
        }
        if (amount > 0 && amount != payment.getAmount()) {
            log.error("支付金额不符 outTradeNo={} 期望={} 实际={}，拒绝入账", outTradeNo, payment.getAmount(), amount);
            return false;
        }
        OffsetDateTime when = paidAt != null ? paidAt : OffsetDateTime.now();
        int rows = paymentMapper.update(null, Wrappers.<Payment>lambdaUpdate()
                .set(Payment::getStatus, PaymentStatus.SUCCESS)
                .set(Payment::getTransactionNo, transactionNo)
                .set(Payment::getPaidAt, when)
                .set(Payment::getUpdatedAt, OffsetDateTime.now())
                .eq(Payment::getId, payment.getId())
                .ne(Payment::getStatus, PaymentStatus.SUCCESS));
        if (rows == 0) {
            return true;  // 并发下已被另一个线程入账
        }
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setTransactionNo(transactionNo);
        payment.setPaidAt(when);

        Order order = orderStateService.getById(payment.getOrderId());
        if (order.getStatus() == OrderStatus.PENDING_PAY) {
            order.setPaidAt(when);
            Store store = storeService.getRequired(order.getStoreId());
            boolean autoAccept = Boolean.TRUE.equals(store.getAutoAccept());
            OrderStatus to = autoAccept ? OrderStatus.MAKING : OrderStatus.PAID;
            if (orderStateService.transition(order, OrderStatus.PENDING_PAY, to, OperatorType.PAY_CHANNEL, null,
                    autoAccept ? "支付成功，自动接单" : "支付成功")) {
                return true;
            }
            order = orderStateService.getById(order.getId());
        }
        // 走到这里：订单不是待支付 —— 已关闭（迟到回调）或已被另一笔支付入账（重复支付）
        String reason = order.getStatus() == OrderStatus.CLOSED ? "订单已关闭后收到支付，自动退款" : "重复支付，自动退款";
        log.warn("订单 {} 状态为 {}，支付 {} 将自动全额退款", order.getOrderNo(), order.getStatus(), outTradeNo);
        refundService.fullRefund(order, payment, RefundInitiator.SYSTEM, null, reason);
        return true;
    }

    // ==================== 关单 / 查单 ====================

    /** 关闭订单的待支付单（渠道关单失败只记日志，由查单补偿兜底） */
    public void closePendingPayments(Order order) {
        List<Payment> pendings = paymentMapper.selectList(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, order.getId())
                .eq(Payment::getStatus, PaymentStatus.PENDING));
        for (Payment p : pendings) {
            paymentMapper.update(null, Wrappers.<Payment>lambdaUpdate()
                    .set(Payment::getStatus, PaymentStatus.CLOSED)
                    .set(Payment::getUpdatedAt, OffsetDateTime.now())
                    .eq(Payment::getId, p.getId())
                    .eq(Payment::getStatus, PaymentStatus.PENDING));
            try {
                channels.get(p.getChannel()).closePayment(p.getOutTradeNo());
            } catch (RuntimeException e) {
                log.warn("渠道关单失败 outTradeNo={}: {}", p.getOutTradeNo(), e.getMessage());
            }
        }
    }

    /**
     * 查单补偿：对订单的支付单向渠道查询真实状态；已支付则入账（含迟到支付 → 自动退款）。
     *
     * @return 是否发现成功支付
     */
    public boolean queryAndSync(Order order) {
        List<Payment> payments = paymentMapper.selectList(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, order.getId())
                .ne(Payment::getStatus, PaymentStatus.SUCCESS));
        boolean found = false;
        for (Payment p : payments) {
            try {
                PayQueryResult r = channels.get(p.getChannel()).queryPayment(p.getOutTradeNo());
                if (r.state() == PayQueryResult.State.SUCCESS) {
                    long amount = r.amount() == null ? p.getAmount() : r.amount();
                    // 自调用不经过代理，@Transactional 不生效：显式开事务，保证支付单 SUCCESS 与订单流转同时提交，
                    // 否则中途异常会留下「支付单已成功、订单仍待支付」并被随后的关单任务关掉
                    tx.executeWithoutResult(s -> onPaySuccess(p.getOutTradeNo(), r.transactionNo(), amount, r.paidAt()));
                    found = true;
                } else if (r.state() == PayQueryResult.State.CLOSED && p.getStatus() == PaymentStatus.PENDING) {
                    paymentMapper.update(null, Wrappers.<Payment>lambdaUpdate()
                            .set(Payment::getStatus, PaymentStatus.CLOSED)
                            .eq(Payment::getId, p.getId()).eq(Payment::getStatus, PaymentStatus.PENDING));
                }
            } catch (RuntimeException e) {
                log.warn("查单失败 outTradeNo={}: {}", p.getOutTradeNo(), e.getMessage());
            }
        }
        return found;
    }

    public Payment latestPayment(Long orderId) {
        List<Payment> list = paymentMapper.selectList(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, orderId)
                .orderByDesc(Payment::getId));
        // 优先返回成功的那笔
        return list.stream().filter(p -> p.getStatus() == PaymentStatus.SUCCESS).findFirst()
                .orElse(list.isEmpty() ? null : list.get(0));
    }

    public Map<Long, Payment> successPayments(List<Long> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Payment> map = new java.util.HashMap<>();
        for (Payment p : paymentMapper.selectList(Wrappers.<Payment>lambdaQuery()
                .in(Payment::getOrderId, orderIds).eq(Payment::getStatus, PaymentStatus.SUCCESS))) {
            map.putIfAbsent(p.getOrderId(), p);
        }
        return map;
    }

    /** Mock 渠道：模拟顾客完成支付 */
    @Transactional
    public void mockPay(Order order) {
        if (!channels.isMock()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "当前不是模拟支付环境");
        }
        Payment payment = paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, order.getId())
                .eq(Payment::getStatus, PaymentStatus.PENDING)
                .orderByDesc(Payment::getId)
                .last("LIMIT 1"));
        if (payment == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "请先发起支付");
        }
        String txn = channels.mock(payment.getChannel()).markPaid(payment.getOutTradeNo());
        onPaySuccess(payment.getOutTradeNo(), txn, payment.getAmount(), OffsetDateTime.now());
    }
}
