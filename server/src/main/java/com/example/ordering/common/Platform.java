package com.example.ordering.common;

/**
 * 订单的下单端 / 支付单的支付渠道。
 * <ul>
 *   <li>H5：会员在浏览器点餐，从账户余额支付——目前唯一在用的值</li>
 *   <li>WECHAT / ALIPAY：已停用的小程序渠道，只为读取历史订单与支付单保留，不再产生新数据，也无法线上退款</li>
 * </ul>
 */
public enum Platform {
    WECHAT,
    ALIPAY,
    H5;

    /** 余额支付：资金在本系统内流转 */
    public boolean isBalance() {
        return this == H5;
    }
}
