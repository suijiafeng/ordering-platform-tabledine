package com.example.ordering.module.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 先吃后付订单结账：登记线下收款方式（金额以订单实付为准） */
public record SettleRequest(
        @NotBlank(message = "请选择收款方式") @Pattern(regexp = "^(CASH|WECHAT|ALIPAY|CARD|OTHER)$", message = "收款方式不正确") String payMethod,
        @Size(max = 255, message = "收款备注最多 255 字") String payRemark) {
}
