package com.example.ordering.module.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 会员密码登录（H5） */
public record PasswordLoginRequest(
        @NotBlank(message = "请输入手机号") @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确") String phone,
        @NotBlank(message = "请输入密码") @Size(max = 64) String password) {
}
