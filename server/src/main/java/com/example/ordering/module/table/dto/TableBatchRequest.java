package com.example.ordering.module.table.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 批量新建桌台：prefix + 序号，例如 prefix=A、from=1、to=10 → A1 ~ A10。
 */
public record TableBatchRequest(
        @Size(max = 8, message = "前缀最多 8 个字符") String prefix,
        @NotNull @Min(1) @Max(999) Integer from,
        @NotNull @Min(1) @Max(999) Integer to
) {
}
