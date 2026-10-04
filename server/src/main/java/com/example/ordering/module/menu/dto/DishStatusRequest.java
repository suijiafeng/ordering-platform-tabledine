package com.example.ordering.module.menu.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 上下架：1 上架 0 下架 */
public record DishStatusRequest(@NotNull @Min(0) @Max(1) Integer status) {
}
