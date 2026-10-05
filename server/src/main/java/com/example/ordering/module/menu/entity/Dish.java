package com.example.ordering.module.menu.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;
import java.time.LocalDate;

@Data
@TableName("dish")
public class Dish {

    public static final int STATUS_ON_SHELF = 1;
    public static final int STATUS_OFF_SHELF = 0;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    private Long categoryId;
    private String name;
    /** 允许更新为 null（商家端清空描述） */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String description;
    /** 基础价（分） */
    private Long price;
    /** 允许更新为 null（商家端删除图片） */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String image;
    private Integer sort;
    /** 1 上架 0 下架 */
    private Integer status;
    private Boolean isSoldOut;
    /** 每日限量库存，null = 不限量；允许更新为 null */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Integer stockQuantity;
    /** 店主设置的每日限量（null 不限量）；每天 0 点 stock_quantity 重置为此值 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Integer dailyStock;
    /** 今日剩余所属的业务日期（Asia/Shanghai）；跨天的订单取消不回补，停机错过 0 点按此补做重置 */
    private LocalDate stockDate;
    @TableLogic
    private Integer deleted;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /** 顾客端是否显示为售罄：手动沽清，或启用了限量库存且已卖完 */
    public boolean soldOutForCustomer() {
        return Boolean.TRUE.equals(isSoldOut) || (stockQuantity != null && stockQuantity <= 0);
    }
}
