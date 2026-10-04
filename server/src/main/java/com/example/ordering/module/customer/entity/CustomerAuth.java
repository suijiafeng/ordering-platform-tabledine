package com.example.ordering.module.customer.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.example.ordering.common.Platform;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("customer_auth")
public class CustomerAuth {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long customerId;
    private Platform platform;
    private String openId;
    private String unionId;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
