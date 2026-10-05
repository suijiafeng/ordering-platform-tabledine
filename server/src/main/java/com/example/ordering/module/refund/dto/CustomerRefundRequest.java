package com.example.ordering.module.refund.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 顾客申请退款：items 为空 = 整单（退全部可退余额）；否则按菜品退。
 */
public record CustomerRefundRequest(
        @NotBlank(message = "请填写退款原因") @Size(max = 255) String reason,
        @Valid @Size(max = 50) List<ItemInput> items) {

    public record ItemInput(@NotNull Long orderItemId,
                            @NotNull @Min(value = 1, message = "退款数量至少为 1") @Max(99) Integer quantity) {
    }
}
