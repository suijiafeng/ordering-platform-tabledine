package com.example.ordering.module.order.dto;

import com.example.ordering.common.Platform;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.RefundStatusOfOrder;
import com.example.ordering.module.refund.dto.RefundView;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 订单详情（顾客端 / 商家端共用）。
 *
 * @param canCancel      顾客端：当前可取消（待支付或待接单）
 * @param canApplyRefund 顾客端：当前可申请退款（制作中 / 待送餐 / 已完成且在售后时限内，且无进行中的退款）
 */
public record OrderDetail(Long id, String orderNo, OrderStatus status, RefundStatusOfOrder refundStatus,
                          Long storeId, String storeName, Long tableId, String tableCode, Platform platform,
                          long totalAmount, long payAmount, long refundedAmount, long refundableAmount,
                          int peopleCount, String remark,
                          OffsetDateTime payExpireAt, OffsetDateTime paidAt, OffsetDateTime acceptedAt,
                          OffsetDateTime readyAt, OffsetDateTime doneAt, OffsetDateTime cancelledAt,
                          String cancelReason, OffsetDateTime createdAt,
                          List<OrderItemView> items, PaymentView payment, List<RefundView> refunds,
                          List<OrderStatusLogView> logs, boolean canCancel, boolean canApplyRefund) {
}
