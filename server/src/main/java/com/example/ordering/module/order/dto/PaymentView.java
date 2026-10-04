package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;

import java.time.OffsetDateTime;

public record PaymentView(String outTradeNo, Platform channel, PaymentStatus status, String transactionNo,
                          long amount, long refundedAmount, OffsetDateTime paidAt) {

    public static PaymentView of(Payment p) {
        return new PaymentView(p.getOutTradeNo(), p.getChannel(), p.getStatus(), p.getTransactionNo(),
                p.getAmount(), p.getRefundedAmount() == null ? 0 : p.getRefundedAmount(), p.getPaidAt());
    }
}
