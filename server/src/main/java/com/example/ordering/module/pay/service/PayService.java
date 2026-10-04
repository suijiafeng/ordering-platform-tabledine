package com.example.ordering.module.pay.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.module.order.dto.PayInitResult;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;
import com.example.ordering.module.pay.mapper.PaymentMapper;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.module.wallet.service.WalletService;
import com.example.ordering.module.pay.channel.BalancePayChannel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 支付：余额支付（发起即扣费入账）与支付成功入账。
 * <p>
 * 入账规则（需求 §7.3 / §16）：
 * <ul>
 *   <li>按 out_trade_no 幂等：支付单已 SUCCESS 直接返回</li>
 *   <li>金额与支付单不一致：拒绝入账并告警</li>
 *   <li>订单待支付 → 已支付（自动接单则直接制作中）</li>
 *   <li>订单已不是待支付（并发下被关闭 / 已被另一笔支付入账）→ 该笔支付自动全额退款</li>
 * </ul>
 */
@Slf4j
@Service
public class PayService {

    private final PaymentMapper paymentMapper;
    private final OrderMapper orderMapper;
    private final OrderStateService orderStateService;
    private final RefundService refundService;
    private final StoreService storeService;
    private final WalletService walletService;

    public PayService(PaymentMapper paymentMapper, OrderMapper orderMapper, OrderStateService orderStateService, RefundService refundService,
                      StoreService storeService, WalletService walletService) {
        this.paymentMapper = paymentMapper;
        this.orderMapper = orderMapper;
        this.orderStateService = orderStateService;
        this.refundService = refundService;
        this.storeService = storeService;
        this.walletService = walletService;
    }

    // ==================== 发起支付 ====================

    /**
     * 余额支付：在本事务内建支付单、扣费并入账，返回时订单已是已支付；
     * 余额不足（42203）整个事务回滚，不留支付单，订单仍待支付。
     */
    @Transactional
    public PayInitResult initiate(Order order) {
        // 锁住订单行并以锁内状态为准：并发的两次支付（双击、重试）串行执行，第二次看到已支付直接拒绝，不会二次扣费
        Order locked = orderMapper.selectOne(Wrappers.<Order>lambdaQuery().eq(Order::getId, order.getId()).last("FOR UPDATE"));
        if (locked == null || locked.getStatus() != OrderStatus.PENDING_PAY) {
            throw new BusinessException(ErrorCode.CONFLICT, "订单当前不可支付");
        }
        if (order.getPayExpireAt().isBefore(OffsetDateTime.now())) {
            throw new BusinessException(ErrorCode.CONFLICT, "订单已超时，请重新下单");
        }
        long attempts = paymentMapper.selectCount(Wrappers.<Payment>lambdaQuery().eq(Payment::getOrderId, order.getId()));
        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setOutTradeNo(attempts == 0 ? order.getOrderNo() : order.getOrderNo() + "P" + (attempts + 1));
        payment.setChannel(Platform.H5);
        payment.setAmount(order.getPayAmount());
        payment.setStatus(PaymentStatus.PENDING);
        payment.setRefundedAmount(0L);
        try {
            paymentMapper.insert(payment);
        } catch (DuplicateKeyException e) {
            // 双击 / 网络重试导致并发发起：同号支付单已由另一请求创建
            throw new BusinessException(ErrorCode.CONFLICT, "支付正在处理中，请稍后刷新");
        }
        walletService.pay(order.getCustomerId(), order.getStoreId(), order.getId(), payment.getOutTradeNo(), payment.getAmount());
        onPaySuccess(payment.getOutTradeNo(), BalancePayChannel.transactionNo(payment.getOutTradeNo()),
                payment.getAmount(), OffsetDateTime.now());
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("balance", true);
        params.put("paid", true);
        return new PayInitResult(order.getOrderNo(), payment.getOutTradeNo(), Platform.H5, payment.getAmount(), params);
    }

    // ==================== 入账 ====================

    /**
     * 支付成功入账（余额扣费后在同一事务内调用）。
     *
     * @return 是否入账（false 表示支付单不存在或金额不符，需人工核对）
     */
    @Transactional
    public boolean onPaySuccess(String outTradeNo, String transactionNo, long amount, OffsetDateTime paidAt) {
        Payment payment = paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery().eq(Payment::getOutTradeNo, outTradeNo));
        if (payment == null) {
            log.warn("入账时找不到支付单: {}", outTradeNo);
            return false;
        }
        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            return true;  // 重复通知，幂等
        }
        // 金额必须与支付单完全一致；缺失 / 0 / 解析失败都按不符处理（fail closed），不能跳过校验
        if (amount != payment.getAmount()) {
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
        // 走到这里：订单不是待支付 —— 并发下已被关闭，或已被另一笔支付入账（重复支付）
        String reason = order.getStatus() == OrderStatus.CLOSED ? "订单已关闭后收到支付，自动退款" : "重复支付，自动退款";
        log.warn("订单 {} 状态为 {}，支付 {} 将自动全额退款", order.getOrderNo(), order.getStatus(), outTradeNo);
        refundService.refundExtraPayment(order, payment, reason);
        return true;
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
}
