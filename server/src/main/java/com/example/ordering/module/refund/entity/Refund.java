package com.example.ordering.module.refund.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.OffsetDateTime;

/** 退款单。refund_no 为商户退款单号 = 渠道幂等键，重试沿用同一单号 */
@Data
@TableName("refund")
public class Refund {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String refundNo;
    private Long storeId;
    private Long orderId;
    private Long paymentId;
    private RefundType type;
    private RefundInitiator initiator;
    private Long amount;
    private String reason;
    private String rejectReason;
    private RefundStatus status;
    private String channelRefundNo;
    /** 操作员工（系统 / 顾客发起为空） */
    private Long operatorId;
    private OffsetDateTime successAt;
    private String failReason;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
