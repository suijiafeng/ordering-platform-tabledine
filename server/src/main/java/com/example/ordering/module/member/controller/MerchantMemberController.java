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

/** 会员与余额充值：查看所有员工可用；建号、改密、停用、充值仅店主（资金操作） */
@Tag(name = "商家端-会员充值")
@Validated
@RestController
@RequestMapping("/api/v1/m/members")
public class MerchantMemberController {

    private final MemberService memberService;

    public MerchantMemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @Operation(summary = "会员列表（手机号 / 姓名搜索）")
    @GetMapping
    public Result<PageResult<MemberView>> list(@RequestParam(required = false) String keyword,
                                               @RequestParam(defaultValue = "1") @Min(1) int page,
                                               @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(memberService.list(keyword, page, pageSize));
    }

    @Operation(summary = "新建会员（可同时首次充值）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping
    public Result<MemberView> create(@Valid @RequestBody MemberCreateRequest req) {
        return Result.ok(memberService.create(req));
    }

    @Operation(summary = "修改姓名 / 重置密码（重置后该会员需重新登录）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/{id}")
    public Result<MemberView> update(@PathVariable Long id, @Valid @RequestBody MemberUpdateRequest req) {
        return Result.ok(memberService.update(id, req));
    }

    @Operation(summary = "启用 / 停用（停用后不能登录与下单）")
    @PreAuthorize("hasRole('OWNER')")
    @PatchMapping("/{id}/status")
    public Result<MemberView> setStatus(@PathVariable Long id, @Valid @RequestBody MemberStatusRequest req) {
        return Result.ok(memberService.setEnabled(id, req.enabled()));
    }

    @Operation(summary = "充值（金额单位：分）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{id}/recharge")
    public Result<MemberView> recharge(@PathVariable Long id, @Valid @RequestBody RechargeRequest req) {
        return Result.ok(memberService.recharge(id, req));
    }

    @Operation(summary = "会员流水（充值 / 扣费 / 退款返还）")
    @GetMapping("/{id}/transactions")
    public Result<PageResult<WalletTransactionView>> transactions(@PathVariable Long id,
                                                                  @RequestParam(defaultValue = "1") @Min(1) int page,
                                                                  @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(memberService.transactions(id, page, pageSize));
    }
}
