package com.example.ordering.module.report.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.security.LoginUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 流水导出（CSV，UTF-8 带 BOM 便于 Excel 直接打开）：按下单日期区间导出订单 + 支付 + 退款明细。
 * 每个订单一行（记录类型=订单），其后每笔已完成 / 处理中的退款一行（记录类型=退款），便于人工对账。
 */
@Service
public class ReportExportService {

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Map<String, String> ORDER_STATUS = Map.of(
            "PENDING_PAY", "待支付", "PAID", "待接单", "MAKING", "制作中", "READY", "待送餐",
            "DONE", "已完成", "CLOSED", "已关闭", "CANCELLED", "已取消");
    private static final Map<String, String> REFUND_STATUS = Map.of(
            "APPLYING", "待审核", "PROCESSING", "处理中", "SUCCESS", "成功", "FAILED", "失败",
            "REJECTED", "已拒绝", "WITHDRAWN", "已撤回", "OFFLINE", "线下退款");

    /** 形如 -12.50 的金额不是公式，不加前缀 */
    private static final java.util.regex.Pattern NUMERIC = java.util.regex.Pattern.compile("[+-]?\\d+(\\.\\d+)?");

    private final JdbcTemplate jdbc;

    public ReportExportService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String exportCsv(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "开始日期不能晚于结束日期");
        }
        if (from.plusDays(91).isBefore(to)) {  // 含首尾共 92 天
            throw new BusinessException(ErrorCode.PARAM_INVALID, "单次最多导出 92 天");
        }
        Long storeId = LoginUser.currentStaff().storeId();
        OffsetDateTime start = from.atStartOfDay(CN).toOffsetDateTime();
        OffsetDateTime end = to.plusDays(1).atStartOfDay(CN).toOffsetDateTime();

        List<Map<String, Object>> orders = jdbc.queryForList("""
                SELECT o.id, o.order_no, o.created_at, o.table_code, o.status, o.refund_status, o.total_amount, o.pay_amount,
                       o.refunded_amount, o.platform, o.paid_at, o.people_count, o.remark,
                       p.out_trade_no, p.transaction_no
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT out_trade_no, transaction_no FROM payment
                    WHERE order_id = o.id AND status = 'SUCCESS' ORDER BY id LIMIT 1
                ) p ON TRUE
                WHERE o.store_id = ? AND o.created_at >= ? AND o.created_at < ?
                ORDER BY o.id
                """, storeId, start, end);
        List<Map<String, Object>> refunds = jdbc.queryForList("""
                SELECT r.order_id, r.refund_no, r.created_at, r.type, r.initiator, r.amount, r.status, r.success_at,
                       r.channel_refund_no, r.reason, r.fail_reason, r.reject_reason, s.name AS operator_name,
                       p.out_trade_no AS refund_out_trade_no, p.transaction_no AS refund_transaction_no
                FROM refund r
                LEFT JOIN staff s ON s.id = r.operator_id
                LEFT JOIN payment p ON p.id = r.payment_id
                WHERE r.store_id = ? AND r.order_id IN (SELECT id FROM orders WHERE store_id = ? AND created_at >= ? AND created_at < ?)
                ORDER BY r.order_id, r.id
                """, storeId, storeId, start, end);
        Map<Object, List<Map<String, Object>>> refundsByOrder = new java.util.HashMap<>();
        for (Map<String, Object> r : refunds) {
            refundsByOrder.computeIfAbsent(r.get("order_id"), k -> new java.util.ArrayList<>()).add(r);
        }

        StringBuilder sb = new StringBuilder("﻿");
        row(sb, "记录类型", "订单号", "下单时间", "桌号", "订单状态", "退款状态", "商品总额(元)", "实付(元)", "累计已退(元)",
                "支付渠道", "支付时间", "商户订单号", "渠道交易号", "退款单号", "退款类型", "退款发起方", "退款金额(元)",
                "退款单状态", "退款完成时间", "渠道退款号", "退款原因", "操作人", "备注");
        for (Map<String, Object> o : orders) {
            row(sb, "订单", o.get("order_no"), time(o.get("created_at")), o.get("table_code"),
                    ORDER_STATUS.getOrDefault(str(o.get("status")), str(o.get("status"))),
                    refundStatusOfOrder(str(o.get("refund_status"))),
                    yuan(o.get("total_amount")), yuan(o.get("pay_amount")), yuan(o.get("refunded_amount")),
                    platform(str(o.get("platform"))), time(o.get("paid_at")), o.get("out_trade_no"), o.get("transaction_no"),
                    "", "", "", "", "", "", "", "", "", o.get("remark"));
            for (Map<String, Object> r : refundsByOrder.getOrDefault(o.get("id"), List.of())) {
                String reason = str(r.get("reason"));
                String status = str(r.get("status"));
                String extra = r.get("fail_reason") != null
                        ? ("FAILED".equals(status) ? "；失败：" : "OFFLINE".equals(status) ? "；" : "；系统提示：") + r.get("fail_reason")
                        : r.get("reject_reason") != null ? "；拒绝：" + r.get("reject_reason") : "";
                row(sb, "退款", o.get("order_no"), time(r.get("created_at")), o.get("table_code"), "", "", "", "", "",
                        // 退款行展示该退款实际对应的支付单（重复支付的退款对应的不是订单首笔支付）
                        platform(str(o.get("platform"))), "",
                        r.get("refund_out_trade_no") != null ? r.get("refund_out_trade_no") : o.get("out_trade_no"),
                        r.get("refund_out_trade_no") != null ? r.get("refund_transaction_no") : o.get("transaction_no"),
                        r.get("refund_no"), refundType(str(r.get("type"))), initiator(str(r.get("initiator"))),
                        yuan(r.get("amount")), REFUND_STATUS.getOrDefault(str(r.get("status")), str(r.get("status"))),
                        time(r.get("success_at")), r.get("channel_refund_no"), reason + extra, r.get("operator_name"), "");
            }
        }
        return sb.toString();
    }

    private static void row(StringBuilder sb, Object... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escape(cells[i]));
        }
        sb.append("\r\n");
    }

    private static String escape(Object v) {
        if (v == null) {
            return "";
        }
        String s = String.valueOf(v);
        // 防止 Excel 把长数字串当数字（订单号 20 位会丢精度）：以制表符前缀强制文本
        if (s.length() >= 15 && s.chars().allMatch(Character::isDigit)) {
            s = "\t" + s;
        } else if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0 && !NUMERIC.matcher(s).matches()) {
            // 顾客备注 / 退款原因是用户输入：以 = + - @ 开头会被 Excel / WPS 当公式执行（CSV 注入），加单引号前缀
            s = "'" + s;
        }
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private static String time(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof Timestamp ts) {
            return ts.toInstant().atZone(CN).format(TS);
        }
        if (v instanceof OffsetDateTime odt) {
            return odt.atZoneSameInstant(CN).format(TS);
        }
        return String.valueOf(v);
    }

    private static String yuan(Object fen) {
        if (fen == null) {
            return "";
        }
        return BigDecimal.valueOf(((Number) fen).longValue()).movePointLeft(2).setScale(2).toPlainString();
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static String platform(String p) {
        return switch (p) {
            case "WECHAT" -> "微信";
            case "H5" -> "余额";
            case "ALIPAY" -> "支付宝";
            default -> p;
        };
    }

    private static String refundStatusOfOrder(String s) {
        return switch (s) {
            case "NONE" -> "无";
            case "PARTIAL" -> "部分退款";
            case "FULL" -> "全额退款";
            default -> s;
        };
    }

    private static String refundType(String s) {
        return switch (s) {
            case "FULL" -> "整单";
            case "ITEM" -> "按菜品";
            case "CUSTOM" -> "自定义金额";
            default -> s;
        };
    }

    private static String initiator(String s) {
        return switch (s) {
            case "CUSTOMER" -> "顾客";
            case "MERCHANT" -> "商家";
            case "SYSTEM" -> "系统";
            default -> s;
        };
    }
}
