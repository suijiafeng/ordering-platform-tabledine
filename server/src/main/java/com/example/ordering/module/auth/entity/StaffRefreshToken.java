package com.example.ordering.module.auth.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 一个仍然有效的员工 refresh token（id = JWT jti），见 StaffAuthService 的轮换说明 */
@Data
@TableName("staff_refresh_token")
public class StaffRefreshToken {

    @TableId(type = IdType.INPUT)
    private String id;
    private Long staffId;
    private OffsetDateTime expiresAt;
    private OffsetDateTime createdAt;
}
