package com.example.ordering.module.store.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("store")
public class Store {

    public static final int STATUS_OPEN = 1;
    public static final int STATUS_CLOSED = 0;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String logo;
    private String phone;
    private String address;
    /** 1 营业 0 打烊 */
    private Integer businessStatus;
    private String businessHours;
    private Boolean autoAccept;
    private Integer payTimeoutMin;
    private Integer acceptTimeoutMin;
    private Integer afterSaleHours;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    public boolean isOpen() {
        return businessStatus != null && businessStatus == STATUS_OPEN;
    }
}
