package com.example.ordering.module.member.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.member.dto.MemberCreateRequest;
import com.example.ordering.module.member.dto.MemberStatusRequest;
import com.example.ordering.module.member.dto.MemberUpdateRequest;
import com.example.ordering.module.member.dto.MemberView;
import com.example.ordering.module.member.dto.RechargeRequest;
import com.example.ordering.module.member.service.MemberService;
import com.example.ordering.module.wallet.dto.WalletTransactionView;
import com.example.ordering.module.audit.web.AuditRead;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 会员与余额充值：店主与前厅可查看、建号、停用、充值（充值需复核操作人密码并全程审计），重置会员密码仅店主；后厨无权访问 */
@Tag(name = "商家端-会员充值")
@Validated
@RestController
@RequestMapping("/api/v1/m/members")
public class MerchantMemberController {

    private final MemberService memberService;

    public MerchantMemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @Operation(summary = "会员列表（手机号 / 姓名搜索；后厨无需访问会员信息）")
    @AuditRead
    @PreAuthorize("!hasRole('KITCHEN')")
    @GetMapping
    public Result<PageResult<MemberView>> list(@RequestParam(required = false) String keyword,
                                               @RequestParam(defaultValue = "1") @Min(1) int page,
                                               @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(memberService.list(keyword, page, pageSize));
    }

    @Operation(summary = "新建会员（可同时首次充值；有首充时需复核当前登录密码）")
    @PreAuthorize("!hasRole('KITCHEN')")
    // 带密码复核：限制频率，防止用已登录的会话暴力猜密码
    @RateLimit(permits = 10, windowSeconds = 60)
    @PostMapping
    public Result<MemberView> create(@Valid @RequestBody MemberCreateRequest req) {
        return Result.ok(memberService.create(req));
    }

    @Operation(summary = "修改姓名 / 重置密码（重置密码仅店主，需复核当前登录密码；重置后该会员需重新登录）")
    @PreAuthorize("!hasRole('KITCHEN')")
    // 重置密码带密码复核：限制频率，防止用已登录的会话暴力猜密码
    @RateLimit(permits = 10, windowSeconds = 60)
    @PutMapping("/{id}")
    public Result<MemberView> update(@PathVariable Long id, @Valid @RequestBody MemberUpdateRequest req) {
        return Result.ok(memberService.update(id, req));
    }

    @Operation(summary = "启用 / 停用（停用后不能登录与下单）")
    @PreAuthorize("!hasRole('KITCHEN')")
    @PatchMapping("/{id}/status")
    public Result<MemberView> setStatus(@PathVariable Long id, @Valid @RequestBody MemberStatusRequest req) {
        return Result.ok(memberService.setEnabled(id, req.enabled()));
    }

    @Operation(summary = "充值（金额单位：分；需复核当前登录密码）")
    @PreAuthorize("!hasRole('KITCHEN')")
    @RateLimit(permits = 10, windowSeconds = 60)
    @PostMapping("/{id}/recharge")
    public Result<MemberView> recharge(@PathVariable Long id, @Valid @RequestBody RechargeRequest req) {
        return Result.ok(memberService.recharge(id, req));
    }

    @Operation(summary = "单个会员（手机号脱敏）")
    @AuditRead
    @PreAuthorize("!hasRole('KITCHEN')")
    @GetMapping("/{id}")
    public Result<MemberView> get(@PathVariable Long id) {
        return Result.ok(memberService.get(id));
    }

    @Operation(summary = "会员流水（充值 / 扣费 / 退款返还）")
    @AuditRead
    @PreAuthorize("!hasRole('KITCHEN')")
    @GetMapping("/{id}/transactions")
    public Result<PageResult<WalletTransactionView>> transactions(@PathVariable Long id,
                                                                  @RequestParam(defaultValue = "1") @Min(1) int page,
                                                                  @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(memberService.transactions(id, page, pageSize));
    }
}
