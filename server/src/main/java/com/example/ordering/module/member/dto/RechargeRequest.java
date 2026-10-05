package com.example.ordering.module.member.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 会员充值（金额单位：分） */
public record RechargeRequest(
        @NotNull(message = "请输入充值金额") @Min(value = 1, message = "充值金额必须大于 0") @Max(value = 100_000_000, message = "单次充值金额过大") Long amount,
        @Size(max = 255) String remark,
        /** 商家端每次打开充值窗口生成；同一请求号重复提交只入账一次 */
        @Size(max = 64) String requestId,
        /** 当前登录员工的密码：充值前复核操作人身份（不落库、不写日志） */
        @NotBlank(message = "请输入当前登录密码以确认身份") @Size(max = 64) String operatorPassword) {
}
