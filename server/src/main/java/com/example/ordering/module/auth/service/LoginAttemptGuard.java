package com.example.ordering.module.auth.service;

import com.example.ordering.config.AppProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 员工登录防爆破：同一账号连续失败 N 次后锁定一段时间（单实例内存实现）。
 */
@Component
public class LoginAttemptGuard {

    private final int maxFailures;
    private final Duration lockDuration;
    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public LoginAttemptGuard(AppProperties appProperties) {
        this.maxFailures = appProperties.getAuth().getMaxLoginFailures();
        this.lockDuration = appProperties.getAuth().getLockDuration();
    }

    public boolean isLocked(String username) {
        Attempt a = attempts.get(key(username));
        return a != null && a.lockedUntil > System.currentTimeMillis();
    }

    public void onFailure(String username) {
        long now = System.currentTimeMillis();
        attempts.compute(key(username), (k, a) -> {
            Attempt next = (a == null || (a.lockedUntil > 0 && a.lockedUntil <= now)) ? new Attempt() : a;
            next.failures++;
            next.lastFailure = now;
            if (next.failures >= maxFailures) {
                next.lockedUntil = now + lockDuration.toMillis();
            }
            return next;
        });
    }

    public void onSuccess(String username) {
        attempts.remove(key(username));
    }

    /** 清理长时间无失败记录的条目 */
    @Scheduled(fixedDelay = 10 * 60_000)
    public void evict() {
        long expireBefore = System.currentTimeMillis() - lockDuration.toMillis();
        attempts.entrySet().removeIf(e -> e.getValue().lastFailure < expireBefore
                && e.getValue().lockedUntil < System.currentTimeMillis());
    }

    private static String key(String username) {
        return username.trim().toLowerCase();
    }

    private static final class Attempt {
        int failures;
        long lastFailure;
        long lockedUntil;
    }
}
