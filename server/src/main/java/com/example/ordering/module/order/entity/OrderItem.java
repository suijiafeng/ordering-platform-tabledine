package com.example.ordering.module.order.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.example.ordering.common.typehandler.JsonbLongListTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

/** 订单明细（下单时的菜品 / 规格 / 加料快照） */
@Data
@TableName(value = "order_item", autoResultMap = true)
public class OrderItem {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long orderId;
    private Long dishId;
    private String dishName;
    private String dishImage;
    @TableField(typeHandler = JsonbLongListTypeHandler.class)
    private List<Long> specItemIds;
    @TableField(typeHandler = JsonbLongListTypeHandler.class)
    private List<Long> addonItemIds;
    private String specDesc;
    private String addonDesc;
    /** 单价（含规格 / 加料加价） */
    private Long unitPrice;
    private Integer quantity;
    private Long totalPrice;
    private Integer refundedQty;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    public int refundableQty() {
        return quantity - (refundedQty == null ? 0 : refundedQty);
    }
}
