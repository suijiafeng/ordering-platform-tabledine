package com.example.ordering.module.audit.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.audit.dto.AuditLogView;
import com.example.ordering.module.audit.entity.AuditLog;
import com.example.ordering.module.audit.entity.AuditOpType;
import com.example.ordering.module.audit.mapper.AuditLogMapper;
import com.example.ordering.security.LoginUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * 操作审计：写入（拦截器 / 定时任务调用）与查询（店主）。
 * 写入失败只记错误日志，绝不影响业务请求本身。
 */
@Slf4j
@Service
public class AuditService {

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final AuditLogMapper auditLogMapper;

    public AuditService(AuditLogMapper auditLogMapper) {
        this.auditLogMapper = auditLogMapper;
    }

    public void record(AuditLog entry) {
        try {
            if (entry.getCreatedAt() == null) {
                entry.setCreatedAt(OffsetDateTime.now());
            }
            auditLogMapper.insert(entry);
        } catch (RuntimeException e) {
            log.error("审计日志写入失败: {} {} {}", entry.getActorType(), entry.getAction(), entry.getTarget(), e);
        }
    }

    /** 系统定时任务执行的自动操作（超时关单、超时自动退款等） */
    public void recordSystem(Long storeId, String category, String action, String target, String detail) {
        AuditLog entry = new AuditLog();
        entry.setStoreId(storeId);
        entry.setActorType(AuditLog.ACTOR_SYSTEM);
        entry.setActorName("系统");
        entry.setCategory(category);
        entry.setOpType(AuditOpType.SYSTEM.name());
        entry.setAction(action);
        entry.setTarget(target);
        entry.setDetail(detail);
        entry.setSuccess(true);
        record(entry);
    }

    /** 店主查询本店审计日志：按日期区间、操作人、模块、结果、关键字筛选，最新在前 */
    public PageResult<AuditLogView> query(LocalDate from, LocalDate to, String actorType, Long actorId, String category,
                                          String opType, Boolean success, String keyword, int page, int pageSize) {
        LambdaQueryWrapper<AuditLog> w = Wrappers.<AuditLog>lambdaQuery()
                // audit_log 不在多租户白名单里，必须显式按门店过滤
                .eq(AuditLog::getStoreId, LoginUser.currentStaff().storeId());
        if (from != null) {
            w.ge(AuditLog::getCreatedAt, from.atStartOfDay(CN).toOffsetDateTime());
        }
        if (to != null) {
            w.lt(AuditLog::getCreatedAt, to.plusDays(1).atStartOfDay(CN).toOffsetDateTime());
        }
        if (StringUtils.hasText(actorType)) {
            w.eq(AuditLog::getActorType, actorType);
        }
        if (actorId != null) {
            w.eq(AuditLog::getActorId, actorId);
        }
        if (StringUtils.hasText(category)) {
            w.eq(AuditLog::getCategory, category);
        }
        if (StringUtils.hasText(opType)) {
            w.eq(AuditLog::getOpType, opType);
        }
        if (success != null) {
            w.eq(AuditLog::getSuccess, success);
        }
        if (StringUtils.hasText(keyword)) {
            String k = keyword.trim();
            w.and(q -> q.like(AuditLog::getAction, k).or().like(AuditLog::getTarget, k)
                    .or().like(AuditLog::getActorName, k).or().like(AuditLog::getDetail, k));
        }
        w.orderByDesc(AuditLog::getId);
        return PageResult.of(auditLogMapper.selectPage(new Page<>(page, pageSize), w), AuditLogView::of);
    }
}
