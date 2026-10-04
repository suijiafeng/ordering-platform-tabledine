package com.example.ordering.module.report.dto;

import java.util.List;

/**
 * 今日看板。
 *
 * @param netIncome      今日实收 = 今日支付成功金额 − 今日退款成功金额（分）
 * @param paidAmount     今日支付成功金额
 * @param refundedAmount 今日退款成功金额（含线下登记）
 * @param orderCount     今日支付成功订单数
 * @param refundCount    今日退款成功笔数
 * @param rechargeAmount 今日会员充值金额（分）；充值是预收款，不计入实收
 * @param daily          最近 7 天每日实收 / 订单数（含今日）
 */
public record DashboardToday(long netIncome, long paidAmount, long refundedAmount, long orderCount, long refundCount,
                             long rechargeAmount,
                             long pendingAcceptCount, long makingCount, long readyCount,
                             long applyingRefundCount, long failedRefundCount,
                             List<DishRank> topDishes, List<DailyPoint> daily) {

    public record DishRank(String dishName, long quantity, long amount) {
    }

    public record DailyPoint(String date, long netIncome, long orderCount) {
    }
}
