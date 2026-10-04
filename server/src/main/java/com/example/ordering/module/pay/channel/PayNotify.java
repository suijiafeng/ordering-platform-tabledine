package com.example.ordering.module.pay.channel;

import java.time.OffsetDateTime;

/** 支付结果通知（已验签）。success=false 表示渠道通知的是未支付 / 关闭等非成功事件，忽略即可 */
public record PayNotify(String outTradeNo, String transactionNo, long amount, boolean success, OffsetDateTime paidAt) {
}
