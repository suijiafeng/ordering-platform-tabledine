package com.example.ordering.module.pay.channel;

import java.time.OffsetDateTime;

/**
 * @param outTradeNo  商户订单号
 * @param amount      金额（分）
 * @param description 商品描述（如「小馆子-A1 桌」）
 * @param payerOpenId 微信 openid / 支付宝 buyer open_id（渠道下单必需）
 * @param expireAt    支付截止时间
 * @param notifyUrl   异步通知地址
 */
public record PayCreateRequest(String outTradeNo, long amount, String description, String payerOpenId,
                               OffsetDateTime expireAt, String notifyUrl) {
}
