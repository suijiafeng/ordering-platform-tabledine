package com.example.ordering.module.refund.entity;

/** 退款单状态机（需求 §8.4） */
public enum RefundStatus {
    /** 顾客申请，待店主审核 */
    APPLYING,
    /** 已向渠道提交，等待结果 */
    PROCESSING,
    SUCCESS,
    FAILED,
    REJECTED,
    WITHDRAWN,
    /** 线下退款并登记（终态，计入已退金额） */
    OFFLINE;

    /**
     * 尚未了结的退款：待审核、处理中，以及失败（商家仍需重试或登记线下退款）。
     * 与 uk_refund_order_active / uk_refund_payment_active 部分唯一索引的状态集合一致。
     */
    public boolean isUnresolved() {
        return this == APPLYING || this == PROCESSING || this == FAILED;
    }

    /** 计入已退金额的终态 */
    public boolean countsAsRefunded() {
        return this == SUCCESS || this == OFFLINE;
    }
}
