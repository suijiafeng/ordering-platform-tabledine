package com.example.ordering.module.pay.channel;

public record RefundNotify(String refundNo, String outTradeNo, RefundResult result) {
}
