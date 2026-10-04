package com.example.ordering.module.report.service;

import com.example.ordering.module.report.dto.DashboardToday;
import com.example.ordering.security.LoginUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * 看板统计。JdbcTemplate 不经过多租户插件，所有 SQL 显式带 store_id。
 * 口径：按支付成功时间（paid_at）归属日期；退款按 success_at 归属日期。
 */
@Service
public class DashboardService {

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final JdbcTemplate jdbc;

    public DashboardService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public DashboardToday today() {
        Long storeId = LoginUser.currentStaff().storeId();
        LocalDate today = LocalDate.now(CN);
        OffsetDateTime start = today.atStartOfDay(CN).toOffsetDateTime();
        OffsetDateTime end = start.plusDays(1);

        long paidAmount = sum("SELECT COALESCE(SUM(pay_amount),0) FROM orders WHERE store_id=? AND paid_at>=? AND paid_at<? AND status<>'PENDING_PAY' AND status<>'CLOSED'", storeId, start, end);
        long orderCount = sum("SELECT COUNT(*) FROM orders WHERE store_id=? AND paid_at>=? AND paid_at<? AND status<>'PENDING_PAY' AND status<>'CLOSED'", storeId, start, end);
        long refundedAmount = sum("SELECT COALESCE(SUM(amount),0) FROM refund WHERE store_id=? AND status IN ('SUCCESS','OFFLINE') AND success_at>=? AND success_at<?", storeId, start, end);
        long refundCount = sum("SELECT COUNT(*) FROM refund WHERE store_id=? AND status IN ('SUCCESS','OFFLINE') AND success_at>=? AND success_at<?", storeId, start, end);
        long pendingAccept = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='PAID'", storeId);
        long making = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='MAKING'", storeId);
        long ready = count("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='READY'", storeId);
        long applying = count("SELECT COUNT(*) FROM refund WHERE store_id=? AND status='APPLYING'", storeId);
        long failed = count("SELECT COUNT(*) FROM refund WHERE store_id=? AND status='FAILED'", storeId);

        List<DashboardToday.DishRank> top = jdbc.query("""
                SELECT oi.dish_name, SUM(oi.quantity - oi.refunded_qty) AS qty, SUM(oi.unit_price * (oi.quantity - oi.refunded_qty)) AS amt
                FROM order_item oi JOIN orders o ON o.id = oi.order_id
                WHERE o.store_id=? AND o.paid_at>=? AND o.paid_at<? AND o.status NOT IN ('PENDING_PAY','CLOSED','CANCELLED')
                GROUP BY oi.dish_name ORDER BY qty DESC, amt DESC LIMIT 10
                """, (rs, i) -> new DashboardToday.DishRank(rs.getString("dish_name"), rs.getLong("qty"), rs.getLong("amt")),
                storeId, start, end);

        List<DashboardToday.DailyPoint> daily = new ArrayList<>();
        for (int d = 6; d >= 0; d--) {
            LocalDate day = today.minusDays(d);
            OffsetDateTime s = day.atStartOfDay(CN).toOffsetDateTime();
            OffsetDateTime e = s.plusDays(1);
            long paid = sum("SELECT COALESCE(SUM(pay_amount),0) FROM orders WHERE store_id=? AND paid_at>=? AND paid_at<? AND status<>'PENDING_PAY' AND status<>'CLOSED'", storeId, s, e);
            long refunded = sum("SELECT COALESCE(SUM(amount),0) FROM refund WHERE store_id=? AND status IN ('SUCCESS','OFFLINE') AND success_at>=? AND success_at<?", storeId, s, e);
            long cnt = sum("SELECT COUNT(*) FROM orders WHERE store_id=? AND paid_at>=? AND paid_at<? AND status<>'PENDING_PAY' AND status<>'CLOSED'", storeId, s, e);
            daily.add(new DashboardToday.DailyPoint(day.toString(), paid - refunded, cnt));
        }

        return new DashboardToday(paidAmount - refundedAmount, paidAmount, refundedAmount, orderCount, refundCount,
                pendingAccept, making, ready, applying, failed, top, daily);
    }

    private long sum(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    private long count(String sql, Object... args) {
        return sum(sql, args);
    }
}
