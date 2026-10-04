package com.example.ordering.module.audit.dto;

import com.example.ordering.module.audit.entity.AuditLog;

import java.time.OffsetDateTime;

/** 审计日志（店主查询） */
public record AuditLogView(Long id, String actorType, Long actorId, String actorName, String actorRole,
                           String category, String opType, String action, String target, String httpMethod, String path,
                           String detail, boolean success, Integer errorCode, String errorMessage,
                           String ip, String userAgent, Integer durationMs, OffsetDateTime createdAt) {

    public static AuditLogView of(AuditLog a) {
        return new AuditLogView(a.getId(), a.getActorType(), a.getActorId(), a.getActorName(), a.getActorRole(),
                a.getCategory(), a.getOpType(), a.getAction(), a.getTarget(), a.getHttpMethod(), a.getPath(), a.getDetail(),
                Boolean.TRUE.equals(a.getSuccess()), a.getErrorCode(), a.getErrorMessage(),
                a.getIp(), a.getUserAgent(), a.getDurationMs(), a.getCreatedAt());
    }
}
