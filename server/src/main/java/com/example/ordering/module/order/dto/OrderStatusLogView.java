package com.example.ordering.module.order.dto;

import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.OrderStatus;

import java.time.OffsetDateTime;

public record OrderStatusLogView(OrderStatus fromStatus, OrderStatus toStatus, OperatorType operatorType,
                                 Long operatorId, String operatorName, String remark, OffsetDateTime createdAt) {
}
