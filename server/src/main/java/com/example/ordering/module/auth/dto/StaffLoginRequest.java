package com.example.ordering.module.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StaffLoginRequest(
        @NotBlank(message = "请输入账号") @Size(max = 32) String username,
        @NotBlank(message = "请输入密码") @Size(max = 64) String password
) {
}
