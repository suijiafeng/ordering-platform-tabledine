package com.example.ordering.module.order.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 商家端轮询：自 since 之后新支付的订单数（用于提示音 / 弹窗），以及当前待接单、待审核退款数量。
 *
 * @param serverTime 服务器当前时间，前端下次轮询以此作为 since
 */
public record NewOrderCount(long newPaidCount, long pendingAcceptCount, long makingCount, long applyingRefundCount,
                            long failedRefundCount, OffsetDateTime serverTime,
                            /** 当前所有待接单订单号：前端按集合去重判断「新来的」，不依赖支付时间与游标，不会因时钟或并发漏提醒 */
                            List<String> pendingOrderNos,
                            /** 申请超过 2 小时仍未审核的退款数（需求 §7.3：再次提醒店主，不自动同意） */
                            long overdueRefundCount,
                            /** 待送餐（已出餐）订单数：后厨队列包含待接单 / 制作中 / 待送餐，菜单角标与之同一口径 */
                            long readyCount,
                            /** 当前所有制作中订单号：后厨账号据此提醒「前厅新确认了一单」 */
                            List<String> makingOrderNos,
                            /** 顾客申请取消、待前厅 / 店主处理的订单数 */
                            long cancelRequestCount,
                            /** 先吃后付、还没结账的订单数 */
                            long unsettledCount) {
}
