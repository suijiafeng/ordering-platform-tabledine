package com.example.ordering.module.member.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 会员充值（金额单位：分） */
public record RechargeRequest(
        @NotNull(message = "请输入充值金额") @Min(value = 1, message = "充值金额必须大于 0") @Max(value = 100_000_000, message = "单次充值金额过大") Long amount,
        @Size(max = 255) String remark) {
}
