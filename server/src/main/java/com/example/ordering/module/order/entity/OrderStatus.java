package com.example.ordering.module.order.entity;

/** 订单履约状态（需求 §7.2） */
public enum OrderStatus {
    /** 待支付 */
    PENDING_PAY,
    /** 已支付，待商家接单 */
    PAID,
    /** 制作中 */
    MAKING,
    /** 已出餐，待送餐 */
    READY,
    /** 已送达 */
    DONE,
    /** 未支付关闭，无资金往来 */
    CLOSED,
    /** 已支付后取消，伴随全额退款 */
    CANCELLED;

    /** 已支付且仍在履约中的状态（可被取消 / 退款） */
    public boolean isActivePaid() {
        return this == PAID || this == MAKING || this == READY;
    }

    public boolean isTerminal() {
        return this == DONE || this == CLOSED || this == CANCELLED;
    }
}
