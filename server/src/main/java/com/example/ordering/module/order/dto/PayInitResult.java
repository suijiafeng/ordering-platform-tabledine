package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;

import java.util.Map;

/**
 * 发起支付结果：小程序用 params 拉起支付（微信 wx.requestPayment / 支付宝 my.tradePay）。
 * mock=true 时为开发环境模拟渠道，调用 mock-pay 接口即可完成支付。
 */
public record PayInitResult(String orderNo, String outTradeNo, Platform channel, long amount, boolean mock,
                            Map<String, Object> params) {
}
