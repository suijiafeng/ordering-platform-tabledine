package com.example.ordering.module.refund.entity;

public enum RefundType {
    /** 整单全额 */
    FULL,
    /** 按菜品明细 */
    ITEM,
    /** 自定义金额（仅店主） */
    CUSTOM
}
