package com.example.ordering.module.report.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.report.dto.DashboardToday;
import com.example.ordering.module.report.dto.ReportSummary;
import com.example.ordering.security.LoginUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 看板统计。JdbcTemplate 不经过多租户插件，所有 SQL 显式带 store_id。
 * 口径：按支付成功时间（paid_at）归属日期；退款按 success_at 归属日期；日期按门店所在时区（Asia/Shanghai）划分。
 */
@Service
public class DashboardService {

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    /** 区间统计最长天数，与流水导出一致 */
    static final int MAX_RANGE_DAYS = 92;

    /** 计入收入口径的订单：已支付成功且未因未支付关闭（已取消订单的款项通过退款扣减，不在这里排除） */
    private static final String PAID_ORDER_WHERE = "FROM orders WHERE store_id=? AND paid_at>=? AND paid_at<? AND status<>'PENDING_PAY' AND status<>'CLOSED'";
    private static final String PAID_SUM = "SELECT COALESCE(SUM(pay_amount),0) " + PAID_ORDER_WHERE;
    private static final String PAID_COUNT = "SELECT COUNT(*) " + PAID_ORDER_WHERE;

    /**
     * 计入收入口径的退款：排除已关闭订单的迟到支付退款、重复支付的退款 ——
     * 这些款项从未计入实收（paid_at 为空或不是订单入账的那笔支付），扣减会让净收入偏低。
     */
    private static final String REFUND_WHERE = """
            FROM refund r
            WHERE r.store_id=? AND r.status IN ('SUCCESS','OFFLINE') AND r.success_at>=? AND r.success_at<?
              AND r.order_scoped
            """;
    private static final String REFUND_SUM = "SELECT COALESCE(SUM(r.amount),0) " + REFUND_WHERE;
    private static final String REFUND_COUNT = "SELECT COUNT(*) " + REFUND_WHERE;

    private final JdbcTemplate jdbc;

    public DashboardService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public DashboardToday today() {
        Long storeId = LoginUser.currentStaff().storeId();
        LocalDate today = LocalDate.now(CN);
        OffsetDateTime start = startOfDay(today);
        OffsetDateTime end = start.plusDays(1);

        PeriodStats stats = periodStats(storeId, start, end);
        long pendingAccept = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='PAID'", storeId);
        long making = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='MAKING'", storeId);
        long ready = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='READY'", storeId);
        long applying = count("SELECT COUNT(*) FROM refund WHERE store_id=? AND status='APPLYING'", storeId);
        long failed = count("SELECT COUNT(*) FROM refund WHERE store_id=? AND status='FAILED'", storeId);

        return new DashboardToday(stats.netIncome(), stats.paidAmount, stats.refundedAmount, stats.orderCount, stats.refundCount,
                pendingAccept, making, ready, applying, failed,
                topDishes(storeId, start, end), dailySeries(storeId, today.minusDays(6), today));
    }

    /** 任意区间统计（含首尾两天）；最长 92 天，与导出一致 */
    public ReportSummary summary(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "开始日期不能晚于结束日期");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "单次最多统计 " + MAX_RANGE_DAYS + " 天");
        }
        Long storeId = LoginUser.currentStaff().storeId();
        OffsetDateTime start = startOfDay(from);
        OffsetDateTime end = startOfDay(to).plusDays(1);
        PeriodStats stats = periodStats(storeId, start, end);
        return new ReportSummary(from, to, stats.netIncome(), stats.paidAmount, stats.refundedAmount, stats.orderCount, stats.refundCount,
                topDishes(storeId, start, end), dailySeries(storeId, from, to));
    }

    private record PeriodStats(long paidAmount, long orderCount, long refundedAmount, long refundCount) {
        long netIncome() {
            return paidAmount - refundedAmount;
        }
    }

    private PeriodStats periodStats(Long storeId, OffsetDateTime start, OffsetDateTime end) {
        return new PeriodStats(
                sum(PAID_SUM, storeId, start, end),
                sum(PAID_COUNT, storeId, start, end),
                sum(REFUND_SUM, storeId, start, end),
                sum(REFUND_COUNT, storeId, start, end));
    }

    private List<DashboardToday.DishRank> topDishes(Long storeId, OffsetDateTime start, OffsetDateTime end) {
        return jdbc.query("""
                SELECT oi.dish_name, SUM(oi.quantity - oi.refunded_qty) AS qty, SUM(oi.unit_price * (oi.quantity - oi.refunded_qty)) AS amt
                FROM order_item oi JOIN orders o ON o.id = oi.order_id
                WHERE o.store_id=? AND o.paid_at>=? AND o.paid_at<? AND o.status NOT IN ('PENDING_PAY','CLOSED','CANCELLED')
                  AND o.refund_status <> 'FULL'  -- 整单 / 自定义退完的订单不计入销量（这类退款不会累加 refunded_qty）
                GROUP BY oi.dish_name ORDER BY qty DESC, amt DESC LIMIT 10
                """, (rs, i) -> new DashboardToday.DishRank(rs.getString("dish_name"), rs.getLong("qty"), rs.getLong("amt")),
                storeId, start, end);
    }

    /**
     * 每日实收 / 订单数：支付与退款各一条按本地日期分组的 SQL，再按日期合并；没有数据的日期补 0，
     * 这样前端图表的横轴是连续的。区间最长 92 天，不会因为逐日查询把查询次数放大。
     */
    private List<DashboardToday.DailyPoint> dailySeries(Long storeId, LocalDate from, LocalDate to) {
        OffsetDateTime start = startOfDay(from);
        OffsetDateTime end = startOfDay(to).plusDays(1);
        Map<LocalDate, long[]> byDay = new HashMap<>();  // [paid, orderCount, refunded]
        jdbc.query("""
                SELECT (paid_at AT TIME ZONE 'Asia/Shanghai')::date AS d, COALESCE(SUM(pay_amount),0) AS paid, COUNT(*) AS cnt
                """ + PAID_ORDER_WHERE + " GROUP BY d",
                rs -> {
                    long[] v = byDay.computeIfAbsent(rs.getDate("d").toLocalDate(), k -> new long[3]);
                    v[0] = rs.getLong("paid");
                    v[1] = rs.getLong("cnt");
                }, storeId, start, end);
        jdbc.query("SELECT (r.success_at AT TIME ZONE 'Asia/Shanghai')::date AS d, COALESCE(SUM(r.amount),0) AS refunded "
                        + REFUND_WHERE + " GROUP BY d",
                rs -> {
                    long[] v = byDay.computeIfAbsent(rs.getDate("d").toLocalDate(), k -> new long[3]);
                    v[2] = rs.getLong("refunded");
                }, storeId, start, end);
        List<DashboardToday.DailyPoint> daily = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            long[] v = byDay.getOrDefault(day, new long[3]);
            daily.add(new DashboardToday.DailyPoint(day.toString(), v[0] - v[2], v[1]));
        }
        return daily;
    }

    private static OffsetDateTime startOfDay(LocalDate day) {
        return day.atStartOfDay(CN).toOffsetDateTime();
    }

    private long sum(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    private long count(String sql, Object... args) {
        return sum(sql, args);
    }
}
