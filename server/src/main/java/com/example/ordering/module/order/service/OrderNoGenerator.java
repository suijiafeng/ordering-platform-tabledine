package com.example.ordering.module.order.service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 单号生成：时间戳（14 位）+ 6 位随机数 = 20 位数字；退款单号前缀 R。
 * 唯一性由数据库唯一约束兜底，冲突概率极低（同一秒内 10^6 取样）。
 */
public final class OrderNoGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private OrderNoGenerator() {
    }

    public static String orderNo() {
        return LocalDateTime.now(CN).format(FMT) + String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    public static String refundNo() {
        return "R" + orderNo();
    }
}
