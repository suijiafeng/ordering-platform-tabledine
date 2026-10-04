package com.example.ordering.module.audit.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 操作审计日志（只追加，见 V13 迁移中的触发器） */
@Data
@TableName("audit_log")
public class AuditLog {

    public static final String ACTOR_STAFF = "STAFF";
    public static final String ACTOR_CUSTOMER = "CUSTOMER";
    public static final String ACTOR_SYSTEM = "SYSTEM";
    public static final String ACTOR_ANONYMOUS = "ANONYMOUS";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    private String actorType;
    private Long actorId;
    private String actorName;
    private String actorRole;
    private String category;
    /** 操作类别，见 {@link AuditOpType} */
    private String opType;
    private String action;
    private String target;
    private String httpMethod;
    private String path;
    private String detail;
    private Boolean success;
    private Integer errorCode;
    private String errorMessage;
    private String ip;
    private String userAgent;
    private Integer durationMs;
    private OffsetDateTime createdAt;
}
