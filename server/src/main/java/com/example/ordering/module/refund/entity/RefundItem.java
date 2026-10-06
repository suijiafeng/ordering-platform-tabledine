package com.example.ordering.module.refund.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 按菜品退款时的明细 */
@Data
@TableName("refund_item")
public class RefundItem {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long refundId;
    private Long orderItemId;
    private Integer quantity;
    private Long amount;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
