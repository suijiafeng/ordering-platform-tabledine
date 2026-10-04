package com.example.ordering.module.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 会员修改自己的密码 */
public record CustomerChangePasswordRequest(
        @NotBlank(message = "请输入原密码") @Size(max = 64) String oldPassword,
        @NotBlank(message = "请输入新密码") @Size(min = 6, max = 64, message = "新密码长度 6~64 位") String newPassword) {
}
