package com.example.ordering.module.auth.dto;

import com.example.ordering.common.Platform;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CustomerLoginRequest(
        @NotNull(message = "platform 不能为空") Platform platform,
        @NotBlank(message = "code 不能为空") @Size(max = 256, message = "code 过长") String code
) {
}
