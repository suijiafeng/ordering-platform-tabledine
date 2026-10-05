package com.example.ordering.module.pay.entity;

import java.util.Arrays;

/** 线下收款方式（payment.pay_method），前厅代客下单记账时选择 */
public enum OfflinePayMethod {
    CASH("现金"),
    WECHAT("微信"),
    ALIPAY("支付宝"),
    CARD("银行卡"),
    OTHER("其他");

    private final String label;

    OfflinePayMethod(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 中文名；未知值原样返回，空值返回「线下」 */
    public static String label(String code) {
        if (code == null) {
            return "线下";
        }
        return Arrays.stream(values()).filter(m -> m.name().equals(code)).findFirst().map(OfflinePayMethod::label).orElse(code);
    }
}
