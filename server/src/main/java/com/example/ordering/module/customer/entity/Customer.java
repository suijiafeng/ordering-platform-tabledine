package com.example.ordering.module.customer.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("customer")
public class Customer {

    public static final int STATUS_NORMAL = 1;
    public static final int STATUS_DISABLED = 0;

    public boolean isEnabled() {
        return status != null && status == STATUS_NORMAL;
    }

    /** 是否是可用密码登录、有余额钱包的会员账号 */
    public boolean isMember() {
        return phone != null && passwordHash != null;
    }

    @TableId(type = IdType.AUTO)
    private Long id;
    private String nickname;
    private String avatar;
    /** 登录账号（会员，手机号）；小程序顾客为空 */
    private String phone;
    private Integer status;
    /** 会员归属门店（商家后台创建）；小程序顾客为空 */
    private Long storeId;
    /** 会员登录密码；为空不能用密码登录 */
    private String passwordHash;
    /** 账户余额（分），只能通过 CustomerMapper 的条件更新变动 */
    private Long balance;
    /** 重置密码 / 停用后递增，旧 token 失效 */
    private Integer tokenVersion;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
