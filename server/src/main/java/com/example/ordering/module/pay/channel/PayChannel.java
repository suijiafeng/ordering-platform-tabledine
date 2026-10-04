package com.example.ordering.module.pay.channel;

import com.example.ordering.common.Platform;

import java.util.Map;

/**
 * 支付渠道抽象：微信支付（JSAPI / APIv3）、支付宝（小程序支付）、开发环境 Mock。
 * 所有金额单位为分；渠道调用失败抛 {@code BusinessException(PAY_CHANNEL_ERROR / REFUND_CHANNEL_ERROR)}。
 */
public interface PayChannel {

    Platform platform();

    /** 向渠道下单，返回小程序拉起支付所需参数（微信：JSAPI 调起参数；支付宝：tradeNO） */
    Map<String, Object> createPayment(PayCreateRequest req);

    /** 主动查单（回调丢失补偿） */
    PayQueryResult queryPayment(String outTradeNo);

    /** 关单（待支付超时）；渠道侧已关闭 / 不存在时静默成功 */
    void closePayment(String outTradeNo);

    /** 发起退款；重试沿用同一 refundNo，渠道按单号幂等 */
    RefundResult refund(RefundChannelRequest req);

    /** 退款结果查询 */
    RefundResult queryRefund(String refundNo, String outTradeNo);

    /** 解析并验签支付结果通知；验签失败抛 IllegalArgumentException */
    PayNotify parsePayNotify(NotifyRequest req);

    /** 解析并验签退款结果通知（支付宝无独立退款通知，返回 null） */
    default RefundNotify parseRefundNotify(NotifyRequest req) {
        return null;
    }

    /** 渠道给回调的应答体（微信为 JSON，支付宝为 success / fail 文本） */
    String notifyAck(boolean ok);
}
