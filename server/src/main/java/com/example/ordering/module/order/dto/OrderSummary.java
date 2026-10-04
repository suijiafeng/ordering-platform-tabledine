package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.RefundStatusOfOrder;

import java.time.OffsetDateTime;
import java.util.List;

/** 订单列表项（商家端列表 / 后厨队列 / 顾客历史订单共用） */
public record OrderSummary(Long id, String orderNo, OrderStatus status, RefundStatusOfOrder refundStatus,
                           String tableCode, Platform platform, long totalAmount, long payAmount, long refundedAmount,
                           int peopleCount, String remark, int itemCount, List<OrderItemView> items,
                           OffsetDateTime createdAt, OffsetDateTime payExpireAt, OffsetDateTime paidAt,
                           OffsetDateTime acceptedAt, OffsetDateTime readyAt) {
}
