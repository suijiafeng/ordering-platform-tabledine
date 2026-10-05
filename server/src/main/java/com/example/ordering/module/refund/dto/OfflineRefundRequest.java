package com.example.ordering.module.refund.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 登记线下退款（现金 / 转账）：备注凭证说明 */
public record OfflineRefundRequest(@NotBlank(message = "请填写线下退款说明") @Size(max = 255) String remark) {
}
