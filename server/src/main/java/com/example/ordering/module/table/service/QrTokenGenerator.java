package com.example.ordering.module.table.service;

import java.security.SecureRandom;
import java.util.Base64;

/** 桌码 token：18 字节随机数 → 24 位 URL 安全字符，不可猜测 */
public final class QrTokenGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private QrTokenGenerator() {
    }

    public static String next() {
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
