package com.example.ordering.module.order.dto;

import com.example.ordering.module.order.entity.Order;

import java.time.OffsetDateTime;

/**
 * 顾客接单后的取消申请（顾客端 / 商家端共用）。
 *
 * @param status       APPLYING 待商家处理 / APPROVED 已同意（订单已取消并退款）/ REJECTED 已拒绝
 * @param rejectReason 商家拒绝理由，顾客可见
 */
public record CancelRequestView(String status, String reason, OffsetDateTime requestedAt,
                                String rejectReason, OffsetDateTime handledAt) {

    public static CancelRequestView of(Order o) {
        if (o.getCancelRequestStatus() == null) {
            return null;
        }
        return new CancelRequestView(o.getCancelRequestStatus(), o.getCancelRequestReason(), o.getCancelRequestedAt(),
                o.getCancelRejectReason(), o.getCancelHandledAt());
    }
}
