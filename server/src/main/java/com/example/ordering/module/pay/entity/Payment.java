package com.example.ordering.module.pay.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.example.ordering.common.Platform;
import lombok.Data;

import java.time.OffsetDateTime;

/** 支付单：一次向渠道发起的支付。out_trade_no 为商户订单号 = 渠道幂等键 */
@Data
@TableName("payment")
public class Payment {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long orderId;
    private String outTradeNo;
    private Platform channel;
    /** 交易号（余额支付为 BAL + 商户订单号） */
    private String transactionNo;
    private Long amount;
    private PaymentStatus status;
    private OffsetDateTime paidAt;
    private Long refundedAmount;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
