package com.example.ordering.module.audit.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.audit.dto.AuditLogView;
import com.example.ordering.module.audit.service.AuditService;
import com.example.ordering.module.audit.web.AuditRead;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** 操作审计日志查询（仅店主，只读；日志本身不可修改或删除） */
@Tag(name = "商家端-审计日志")
@Validated
@RestController
@RequestMapping("/api/v1/m/audit-logs")
public class MerchantAuditController {

    private final AuditService auditService;

    public MerchantAuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @Operation(summary = "查询审计日志（按日期、操作人、模块、类别、结果、关键字筛选）")
    @PreAuthorize("hasRole('OWNER')")
    @AuditRead
    @GetMapping
    public Result<PageResult<AuditLogView>> query(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String actorType,
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String opType,
            @RequestParam(required = false) Boolean success,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(auditService.query(from, to, actorType, actorId, category, opType, success, keyword, page, pageSize));
    }
}
