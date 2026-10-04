package com.example.ordering.module.table.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("dining_table")
public class DiningTable {

    public static final int STATUS_ENABLED = 1;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    /** 桌号（展示用） */
    private String code;
    /** 随机不可猜的桌码 token */
    private String qrToken;
    private Integer status;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
