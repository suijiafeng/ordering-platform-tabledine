package com.example.ordering.module.member.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 新建会员。
 *
 * @param initialAmount    可选：建号时顺带充值的金额（分）
 * @param operatorPassword 有首次充值时必填：当前登录员工的密码，复核操作人身份
 */
public record MemberCreateRequest(
        @NotBlank(message = "请输入手机号") @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确") String phone,
        @NotBlank(message = "请输入姓名") @Size(max = 64) String name,
        @NotBlank(message = "请设置初始密码") @Size(min = 6, max = 64, message = "密码长度 6~64 位") String password,
        @Min(value = 0, message = "充值金额不能为负") @Max(value = 100_000_000, message = "单次充值金额过大") Long initialAmount,
        @Size(max = 64) String operatorPassword) {
}
