package com.example.ordering.module.order.dto;

import java.time.OffsetDateTime;

/**
 * 商家端轮询：自 since 之后新支付的订单数（用于提示音 / 弹窗），以及当前待接单、待审核退款数量。
 *
 * @param serverTime 服务器当前时间，前端下次轮询以此作为 since
 */
public record NewOrderCount(long newPaidCount, long pendingAcceptCount, long makingCount, long applyingRefundCount,
                            long failedRefundCount, OffsetDateTime serverTime) {
}
