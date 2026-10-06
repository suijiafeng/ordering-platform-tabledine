package com.example.ordering.module.report.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 任意日期区间的经营统计（店主）。口径与今日看板一致：按支付成功日期归属，退款按退款成功日期归属。
 *
 * @param netIncome      区间实收 = 支付成功金额 − 退款成功金额（分）
 * @param paidAmount     区间支付成功金额
 * @param refundedAmount 区间退款成功金额（含线下登记）
 * @param orderCount     区间支付成功订单数
 * @param refundCount    区间退款成功笔数
 * @param rechargeAmount 区间会员充值金额（分）；充值是预收款，不计入实收
 * @param topDishes      区间菜品销量排行（前 10）
 * @param daily          区间内每一天的实收 / 订单数 / 支付金额 / 退款金额，没有订单的日期也会出现（值为 0）
 * @param byPayMethod    按收款方式汇总的支付金额与订单数：BALANCE 会员余额，线下收款为 CASH / WECHAT / ALIPAY / CARD / OTHER
 */
public record ReportSummary(LocalDate from, LocalDate to, long netIncome, long paidAmount, long refundedAmount,
                            long orderCount, long refundCount, long rechargeAmount,
                            List<DashboardToday.DishRank> topDishes, List<DashboardToday.DailyPoint> daily,
                            List<PayMethodStat> byPayMethod) {

    /** 一种收款方式的支付金额（分）与订单数 */
    public record PayMethodStat(String method, String label, long amount, long orderCount) {
    }
}
