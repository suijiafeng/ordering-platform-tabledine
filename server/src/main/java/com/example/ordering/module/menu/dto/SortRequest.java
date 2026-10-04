package com.example.ordering.module.menu.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 按 ids 顺序重新排序 */
public record SortRequest(@NotEmpty(message = "ids 不能为空") @Size(max = 500) List<Long> ids) {
}
