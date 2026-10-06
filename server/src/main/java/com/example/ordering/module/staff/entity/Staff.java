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
    /** 前厅店员：接单 / 拒单 / 送达；界面上显示为「前厅」（沿用 STAFF 取值，已有账号无需迁移） */
    public static final String ROLE_STAFF = "STAFF";
    /** 后厨：只处理已由前厅确认的订单（出餐），不能接单 / 拒单 / 送达——权责分离 */
    public static final String ROLE_KITCHEN = "KITCHEN";
    public static final int STATUS_ENABLED = 1;
    public static final int STATUS_DISABLED = 0;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    private String username;
    private String passwordHash;
    private String name;
    /** OWNER / STAFF（前厅）/ KITCHEN（后厨） */
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
