package com.example.ordering.module.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 前厅代客下单 + 线下收款登记。服务端按菜单重新计价；顾客当面付款，前厅登记收款方式，订单直接进入「待制作」。
 *
 * @param clientRequestId 防重复提交：同一门店同一请求号只创建一笔
 * @param payMode         PAY_FIRST 先付后吃（默认，下单即登记收款）/ PAY_LATER 先吃后付（下单不收款，离店结账）
 * @param payMethod       先付后吃时必填的线下收款方式：CASH 现金 / WECHAT 微信 / ALIPAY 支付宝 / CARD 银行卡 / OTHER 其他
 */
public record MerchantCreateOrderRequest(
        @NotBlank(message = "缺少 clientRequestId") @Size(max = 64) String clientRequestId,
        @NotNull(message = "请选择桌号") Long tableId,
        @NotEmpty(message = "请选择菜品") @Size(max = 50, message = "单笔订单最多 50 种菜品") @Valid List<CreateOrderRequest.Item> items,
        @Min(value = 1, message = "就餐人数至少 1 人") @Max(value = 99, message = "就餐人数过多") Integer peopleCount,
        @Size(max = 255, message = "备注最多 255 字") String remark,
        @Pattern(regexp = "^(PAY_FIRST|PAY_LATER)$", message = "付款模式不正确") String payMode,
        @Pattern(regexp = "^(CASH|WECHAT|ALIPAY|CARD|OTHER)$", message = "收款方式不正确") String payMethod,
        @Size(max = 255, message = "收款备注最多 255 字") String payRemark) {
}
