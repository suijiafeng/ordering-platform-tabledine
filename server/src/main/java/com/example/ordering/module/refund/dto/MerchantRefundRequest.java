package com.example.ordering.module.refund.dto;

import com.example.ordering.module.refund.entity.RefundType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 商家主动退款：FULL 整单；ITEM 按菜品（需 items）；CUSTOM 自定义金额（需 amount，仅店主）。
 */
public record MerchantRefundRequest(
        @NotBlank(message = "缺少退款请求编号，请刷新页面后重试")
        @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9_-]{0,63}", message = "退款请求编号格式不正确") String clientRequestId,
        @NotNull(message = "缺少退款类型") RefundType type,
        @NotBlank(message = "请填写退款原因") @Size(max = 255) String reason,
        @Valid @Size(max = 50) List<CustomerRefundRequest.ItemInput> items,
        @Min(value = 1, message = "退款金额至少 1 分") @Max(value = 100_000_000L) Long amount) {
}
