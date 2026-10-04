package com.example.ordering.ratelimit;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口限流（固定窗口，单实例内存计数）。
 * <p>
 * 限流维度：已登录按「接口 + 用户」，未登录按「接口 + IP」。
 * 多实例部署时需替换为 Redis 实现。
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    /** 窗口内允许的最大请求数 */
    int permits();

    /** 窗口长度（秒） */
    int windowSeconds() default 60;
}
