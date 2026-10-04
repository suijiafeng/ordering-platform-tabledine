package com.example.ordering.module.refund.dto;

import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.entity.RefundType;

import java.time.OffsetDateTime;
import java.util.List;

public record RefundView(Long id, String refundNo, String orderNo, String tableCode, RefundType type,
                         RefundInitiator initiator, long amount, String reason, String rejectReason,
                         RefundStatus status, String failReason, String channelRefundNo, Long operatorId,
                         String operatorName, OffsetDateTime createdAt, OffsetDateTime successAt,
                         List<RefundItemView> items) {

    public record RefundItemView(Long orderItemId, String dishName, String specDesc, int quantity, long amount) {
    }
}
