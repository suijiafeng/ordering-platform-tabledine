package com.example.ordering.module.order.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.example.ordering.common.Platform;
import lombok.Data;

import java.time.OffsetDateTime;

/** 订单主表 orders。金额单位：分 */
@Data
@TableName("orders")
public class Order {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    /** 客户端请求 ID，与 customer_id 组成唯一键，防重复下单 */
    private String clientRequestId;
    private Long storeId;
    private Long tableId;
    /** 下单时的桌号快照 */
    private String tableCode;
    private Long customerId;
    private Platform platform;
    private OrderStatus status;
    private RefundStatusOfOrder refundStatus;
    /** 商品总额 */
    private Long totalAmount;
    /** 应付 / 实付金额（MVP 无优惠，等于 totalAmount） */
    private Long payAmount;
    private Long refundedAmount;
    private Integer peopleCount;
    private String remark;
    private OffsetDateTime payExpireAt;
    private OffsetDateTime paidAt;
    private OffsetDateTime acceptedAt;
    private OffsetDateTime readyAt;
    private OffsetDateTime doneAt;
    private OffsetDateTime cancelledAt;
    private String cancelReason;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /** 可退余额 = 实付 − 已退成功（处理中的由退款单层面保证同一时刻只有一笔） */
    public long refundableAmount() {
        return payAmount - (refundedAmount == null ? 0 : refundedAmount);
    }
}
