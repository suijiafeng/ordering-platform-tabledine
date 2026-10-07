package com.example.ordering.module.refund.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.refund.dto.OfflineRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.dto.RejectRefundRequest;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.security.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 退款管理：查看所有员工可用；审核 / 重试 / 线下登记仅店主 */
@Tag(name = "商家端-退款")
@Validated
@RestController
@RequestMapping("/api/v1/m/refunds")
public class MerchantRefundController {

    private final RefundService refundService;

    public MerchantRefundController(RefundService refundService) {
        this.refundService = refundService;
    }

    @Operation(summary = "退款单列表（status 逗号分隔）")
    @GetMapping
    public Result<PageResult<RefundView>> list(@RequestParam(required = false) String status,
                                               @RequestParam(defaultValue = "1") @Min(1) int page,
                                               @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(refundService.merchantList(status, page, pageSize));
    }

    @Operation(summary = "退款单详情")
    @GetMapping("/{refundNo}")
    public Result<RefundView> get(@PathVariable String refundNo) {
        return Result.ok(refundService.merchantGet(refundNo));
    }

    @Operation(summary = "同意退款申请")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{refundNo}/approve")
    public Result<RefundView> approve(@PathVariable String refundNo) {
        return Result.ok(refundService.approve(refundNo, LoginUser.currentStaff().id()));
    }

    @Operation(summary = "拒绝退款申请（必填理由）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{refundNo}/reject")
    public Result<RefundView> reject(@PathVariable String refundNo, @Valid @RequestBody RejectRefundRequest req) {
        return Result.ok(refundService.reject(refundNo, req.reason(), LoginUser.currentStaff().id()));
    }

    @Operation(summary = "失败重试（沿用同一退款单号）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{refundNo}/retry")
    public Result<RefundView> retry(@PathVariable String refundNo) {
        return Result.ok(refundService.retry(refundNo, LoginUser.currentStaff().id()));
    }

    @Operation(summary = "登记线下退款")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{refundNo}/offline")
    public Result<RefundView> offline(@PathVariable String refundNo, @Valid @RequestBody OfflineRefundRequest req) {
        return Result.ok(refundService.offline(refundNo, req.remark(), LoginUser.currentStaff().id()));
    }
}
