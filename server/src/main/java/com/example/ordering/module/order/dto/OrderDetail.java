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
 * @param cookingStartedAt 后厨开始制作时间：制作中且为空 = 已接单、待制作（商家端显示「待制作」，顾客端显示「已接单」）
 * @param canRequestCancel 顾客端：商家已接单、后厨尚未开始制作，可申请取消（需商家确认）
 * @param cancelRequest    顾客取消申请；没有申请过为空
 */
public record OrderDetail(Long id, String orderNo, OrderStatus status, RefundStatusOfOrder refundStatus,
                          Long storeId, String storeName, Long tableId, String tableCode, Platform platform,
                          long totalAmount, long payAmount, long refundedAmount, long refundableAmount,
                          int peopleCount, String remark,
                          OffsetDateTime payExpireAt, OffsetDateTime paidAt, OffsetDateTime acceptedAt,
                          OffsetDateTime readyAt, OffsetDateTime doneAt, OffsetDateTime cancelledAt,
                          String cancelReason, OffsetDateTime createdAt,
                          List<OrderItemView> items, PaymentView payment, List<RefundView> refunds,
                          List<OrderStatusLogView> logs, boolean canCancel, boolean canApplyRefund,
                          OffsetDateTime cookingStartedAt, boolean canRequestCancel, CancelRequestView cancelRequest,
                          /** 下单来源：CUSTOMER 顾客扫码 / MERCHANT 前厅代客下单 */
                          String source,
                          /** PAY_FIRST 先付后吃 / PAY_LATER 先吃后付（paidAt 为空即未结账） */
                          String payMode) {
}
