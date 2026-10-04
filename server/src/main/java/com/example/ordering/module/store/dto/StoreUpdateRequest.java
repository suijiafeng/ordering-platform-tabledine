package com.example.ordering.module.store.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 店铺信息与业务参数（店主） */
public record StoreUpdateRequest(
        @NotBlank(message = "请输入店铺名称") @Size(max = 64) String name,
        @Size(max = 255) String logo,
        @Size(max = 20) String phone,
        @Size(max = 255) String address,
        @Size(max = 64) String businessHours,
        @NotNull Boolean autoAccept,
        @NotNull @Min(value = 5, message = "未支付关单时长 5~60 分钟") @Max(value = 60, message = "未支付关单时长 5~60 分钟") Integer payTimeoutMin,
        @NotNull @Min(value = 1, message = "未接单自动退款时长 1~60 分钟") @Max(value = 60, message = "未接单自动退款时长 1~60 分钟") Integer acceptTimeoutMin,
        @NotNull @Min(value = 0, message = "售后时限 0~168 小时") @Max(value = 168, message = "售后时限 0~168 小时") Integer afterSaleHours
) {
}
