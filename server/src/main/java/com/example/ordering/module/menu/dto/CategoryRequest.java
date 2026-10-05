package com.example.ordering.module.menu.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(
        @NotBlank(message = "请输入分类名称") @Size(max = 32, message = "分类名称最多 32 个字") String name,
        Integer sort,
        @Min(0) @Max(1) Integer status
) {
}
