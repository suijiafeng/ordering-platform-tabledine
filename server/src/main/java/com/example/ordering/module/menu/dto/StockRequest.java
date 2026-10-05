package com.example.ordering.module.menu.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 每日限量库存；stockQuantity 为 null 表示不限量 */
public record StockRequest(@Min(0) @Max(100_000) Integer stockQuantity) {
}
