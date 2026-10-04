package com.example.ordering.module.order.dto;

import java.time.OffsetDateTime;

/**
 * 商家端轮询：自 since 之后新支付的订单数（用于提示音 / 弹窗），以及当前待接单、待审核退款数量。
 *
 * @param serverTime 服务器当前时间，前端下次轮询以此作为 since
 */
public record NewOrderCount(long newPaidCount, long pendingAcceptCount, long makingCount, long applyingRefundCount,
                            long failedRefundCount, OffsetDateTime serverTime,
                            /** 当前所有待接单订单号：前端按集合去重判断「新来的」，不依赖支付时间与游标，回调晚到也不会漏提醒 */
                            java.util.List<String> pendingOrderNos,
                            /** 申请超过 2 小时仍未审核的退款数（需求 §7.3：再次提醒店主，不自动同意） */
                            long overdueRefundCount) {
}
