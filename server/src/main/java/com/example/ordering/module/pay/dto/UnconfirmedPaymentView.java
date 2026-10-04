package com.example.ordering.module.pay.dto;

import com.example.ordering.common.Platform;

import java.time.OffsetDateTime;

/** 本地已关闭、渠道未能确认的支付单（需人工到渠道商户平台核对） */
public record UnconfirmedPaymentView(String outTradeNo, String orderNo, Platform channel, long amount,
                                     OffsetDateTime createdAt, OffsetDateTime closedAt) {
}
