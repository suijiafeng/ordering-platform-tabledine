package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;

import java.util.Map;

/**
 * 发起支付结果。余额支付在同一事务里扣费入账：params.paid=true 表示返回时订单已支付。
 */
public record PayInitResult(String orderNo, String outTradeNo, Platform channel, long amount, Map<String, Object> params) {
}
