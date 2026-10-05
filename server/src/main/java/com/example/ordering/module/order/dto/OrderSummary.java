package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.RefundStatusOfOrder;

import java.time.OffsetDateTime;
import java.util.List;

/** 订单列表项（商家端列表 / 后厨队列 / 顾客历史订单共用）；cookingStartedAt 为空表示后厨尚未开始制作 */
public record OrderSummary(Long id, String orderNo, OrderStatus status, RefundStatusOfOrder refundStatus,
                           String tableCode, Platform platform, long totalAmount, long payAmount, long refundedAmount,
                           int peopleCount, String remark, int itemCount, List<OrderItemView> items,
                           OffsetDateTime createdAt, OffsetDateTime payExpireAt, OffsetDateTime paidAt,
                           OffsetDateTime acceptedAt, OffsetDateTime readyAt, OffsetDateTime cookingStartedAt,
                           /** 顾客取消申请状态（APPLYING / APPROVED / REJECTED），没有申请为空 */
                           String cancelRequestStatus,
                           /** 下单来源：CUSTOMER 顾客扫码 / MERCHANT 前厅代客下单 */
                           String source,
                           /** PAY_FIRST 先付后吃 / PAY_LATER 先吃后付（paidAt 为空即未结账） */
                           String payMode) {
}
