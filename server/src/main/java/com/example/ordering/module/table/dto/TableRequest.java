package com.example.ordering.module.table.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TableRequest(
        @NotBlank(message = "请输入桌号") @Size(max = 16, message = "桌号最多 16 个字符") String code,
        @Min(0) @Max(1) Integer status
) {
}
