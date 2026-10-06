package com.example.ordering.module.refund.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;
import com.example.ordering.module.pay.mapper.PaymentMapper;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundItem;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.mapper.RefundItemMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

/**
 * 退款入账：退款成功 / 线下登记后，累加支付单、订单、菜品行的已退金额与数量，并判断退款的作用域。
 * <p>
 * 事务：本类不开启事务（没有 @Transactional），总是加入调用方的事务，与退款单状态变更一起提交或回滚。
 */
@Slf4j
@Component
public class RefundLedger {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final PaymentMapper paymentMapper;
    private final RefundItemMapper refundItemMapper;

    public RefundLedger(OrderMapper orderMapper, OrderItemMapper orderItemMapper, PaymentMapper paymentMapper,
                        RefundItemMapper refundItemMapper) {
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.paymentMapper = paymentMapper;
        this.refundItemMapper = refundItemMapper;
    }

    /** 退款对应的支付单：创建时记录的那笔；老数据没记录时取订单入账的那笔 */
    public Payment paymentOf(Refund refund, Order order) {
        if (refund.getPaymentId() != null) {
            Payment payment = paymentMapper.selectById(refund.getPaymentId());
            if (payment != null) {
                return payment;
            }
        }
        return firstSuccessPayment(order.getId());
    }

    /** 订单最早的一笔成功支付 = 订单实际入账的那笔；其后的成功支付都是重复支付 */
    public Payment firstSuccessPayment(Long orderId) {
        return paymentMapper.selectOne(Wrappers.<Payment>lambdaQuery()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, PaymentStatus.SUCCESS)
                .orderByAsc(Payment::getId)
                .last("LIMIT 1"));
    }

    /**
     * 该退款是否计入订单的已退金额 / 退款状态（即 order_scoped）。
     * 已关闭订单的迟到支付、以及重复支付的那笔，退的是订单之外的多余款项，不动订单记账。
     */
    public boolean countsForOrder(Order order, Payment payment) {
        if (payment == null) {
            return true;
        }
        if (order.getStatus() == OrderStatus.CLOSED) {
            return false;
        }
        Payment first = firstSuccessPayment(order.getId());
        return first == null || first.getId().equals(payment.getId());
    }

    /**
     * 退款成功 / 线下登记后入账：支付单累加已退金额；订单级退款再累加订单已退金额、菜品行已退数量并重算订单退款状态。
     * 调用前退款单状态已在同一事务内改为 SUCCESS / OFFLINE。
     */
    public void applyRefunded(Refund refund, Order order, String channelRefundNo) {
        long amountInCents = refund.getAmount();
        Payment payment = refund.getPaymentId() == null ? null : paymentMapper.selectById(refund.getPaymentId());
        if (payment != null) {
            paymentMapper.update(null, Wrappers.<Payment>lambdaUpdate()
                    .setSql("refunded_amount = refunded_amount + " + amountInCents)
                    .set(Payment::getUpdatedAt, OffsetDateTime.now())
                    .eq(Payment::getId, payment.getId()));
        }
        boolean orderScoped = refund.getOrderScoped() == null || refund.getOrderScoped();
        if (orderScoped) {
            // 在一条 UPDATE 里累加并重算状态（SET 中引用的列是更新前的值），避免并发退款下按内存旧值算错
            orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                    .setSql("refunded_amount = refunded_amount + " + amountInCents)
                    .setSql("refund_status = CASE WHEN refunded_amount + " + amountInCents + " >= pay_amount THEN 'FULL' ELSE 'PARTIAL' END")
                    .set(Order::getUpdatedAt, OffsetDateTime.now())
                    .eq(Order::getId, order.getId()));
            for (RefundItem refundItem : refundItemMapper.selectList(Wrappers.<RefundItem>lambdaQuery().eq(RefundItem::getRefundId, refund.getId()))) {
                orderItemMapper.update(null, Wrappers.<OrderItem>lambdaUpdate()
                        .setSql("refunded_qty = refunded_qty + " + refundItem.getQuantity())
                        .eq(OrderItem::getId, refundItem.getOrderItemId()));
            }
            Order fresh = orderMapper.selectById(order.getId());
            order.setRefundedAmount(fresh.getRefundedAmount());
            order.setRefundStatus(fresh.getRefundStatus());
        }
        refund.setStatus(refund.getStatus() == RefundStatus.OFFLINE ? RefundStatus.OFFLINE : RefundStatus.SUCCESS);
        refund.setChannelRefundNo(channelRefundNo);
        refund.setSuccessAt(OffsetDateTime.now());
        log.info("订单 {} 退款 {} 已完成 金额={} 累计已退={} 退款状态={}", order.getOrderNo(), refund.getRefundNo(), amountInCents,
                order.getRefundedAmount(), order.getRefundStatus());
    }
}
