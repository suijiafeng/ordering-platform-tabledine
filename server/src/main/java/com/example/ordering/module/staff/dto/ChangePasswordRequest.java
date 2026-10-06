package com.example.ordering.module.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank(message = "请输入当前密码") String oldPassword,
        @NotBlank(message = "请输入新密码") @Size(min = 6, max = 64, message = "密码长度 6~64 位") String newPassword) {
}
