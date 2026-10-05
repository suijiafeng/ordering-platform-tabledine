package com.example.ordering.module.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 顾客创建订单。价格全部由服务端按菜单重算，客户端只传选择结果。
 *
 * @param clientRequestId 客户端生成的请求 ID（同一顾客下唯一），网络重试时复用以保证只生成一笔订单
 * @param qrToken         桌码 token（扫码得到），下单时再次校验桌台有效
 */
public record CreateOrderRequest(
        @NotBlank(message = "缺少 clientRequestId") @Size(max = 64) String clientRequestId,
        @NotBlank(message = "缺少桌码") @Size(max = 64) String qrToken,
        @NotEmpty(message = "购物车为空") @Size(max = 50, message = "单笔订单最多 50 种菜品") @Valid List<Item> items,
        @Min(value = 1, message = "就餐人数至少 1 人") @Max(value = 99, message = "就餐人数过多") Integer peopleCount,
        @Size(max = 255, message = "备注最多 255 字") String remark) {

    public record Item(
            @NotNull(message = "缺少菜品 ID") Long dishId,
            @Size(max = 20) List<Long> specItemIds,
            @Size(max = 50) List<Long> addonItemIds,
            @NotNull(message = "缺少数量") @Min(value = 1, message = "数量至少为 1") @Max(value = 99, message = "单个菜品最多 99 份") Integer quantity) {
    }
}
