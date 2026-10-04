package com.example.ordering.module.wallet.entity;

/** 钱包流水类型 */
public enum WalletTransactionType {
    /** 商家充值（余额增加） */
    RECHARGE,
    /** 下单扣费（余额减少） */
    PAY,
    /** 退款返还（余额增加） */
    REFUND;

    public boolean isCredit() {
        return this != PAY;
    }
}
