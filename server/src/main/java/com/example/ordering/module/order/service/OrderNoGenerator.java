package com.example.ordering.module.order.service;

import java.security.SecureRandom;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 单号生成：门店本地时间（Asia/Shanghai，14 位）+ 6 位随机数 = 20 位数字；退款单号前缀 R。
 * 必须显式用上海时区。{@code LocalDateTime.now()} 走 JVM 默认时区：机器在 UTC 时，
 * 店内 20:00:04（东八区）会写成 120004；机器在 UTC+1 时会写成 190004。
 * 唯一性由数据库唯一约束兜底，冲突概率极低（同一秒内 10^6 取样）。
 */
public final class OrderNoGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    /** withZone：即使传入的时间不带时区，也按上海时间格式化，避免落到 JVM 默认时区 */
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(CN);

    private OrderNoGenerator() {
    }

    public static String orderNo() {
        return ZonedDateTime.now(CN).format(FMT) + String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    public static String refundNo() {
        return "R" + orderNo();
    }
}
