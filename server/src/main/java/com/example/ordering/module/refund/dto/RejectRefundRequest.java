package com.example.ordering.module.refund.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectRefundRequest(@NotBlank(message = "拒绝退款必须填写理由") @Size(max = 255) String reason) {
}
