package com.example.ordering.module.pay.channel;

/**
 * @param refundNo      商户退款单号（幂等键）
 * @param outTradeNo    原商户订单号
 * @param transactionNo 原渠道交易号
 * @param refundAmount  本次退款金额（分）
 * @param totalAmount   原订单实付金额（分，微信必填）
 * @param reason        退款原因
 * @param notifyUrl     微信退款结果通知地址
 */
public record RefundChannelRequest(String refundNo, String outTradeNo, String transactionNo, long refundAmount,
                                   long totalAmount, String reason, String notifyUrl) {
}
