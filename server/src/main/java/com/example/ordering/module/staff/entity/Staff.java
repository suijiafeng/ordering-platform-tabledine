package com.example.ordering.module.staff.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("staff")
public class Staff {

    public static final String ROLE_OWNER = "OWNER";
    public static final String ROLE_STAFF = "STAFF";
    public static final int STATUS_ENABLED = 1;
    public static final int STATUS_DISABLED = 0;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    private String username;
    private String passwordHash;
    private String name;
    /** OWNER / STAFF */
    private String role;
    private Integer status;
    /** 停用 / 改密时 +1，使已签发 token 失效 */
    private Integer tokenVersion;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    public boolean isEnabled() {
        return status != null && status == STATUS_ENABLED;
    }
}
