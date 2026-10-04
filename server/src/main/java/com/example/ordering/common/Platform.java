package com.example.ordering.common;

/**
 * 顾客所在平台 / 支付渠道。
 * <ul>
 *   <li>WECHAT / ALIPAY：小程序顾客，走对应渠道支付</li>
 *   <li>H5：浏览器点餐的会员账号，支付走账户余额（商家充值、下单扣费），不经过外部支付渠道</li>
 * </ul>
 */
public enum Platform {
    WECHAT,
    ALIPAY,
    H5;

    /** 余额支付：资金在本系统内流转，没有外部渠道的回调 / 关单 / 对账 */
    public boolean isBalance() {
        return this == H5;
    }
}
