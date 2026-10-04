package com.example.ordering.module.auth.service;

import com.example.ordering.config.AppProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 员工登录防爆破（单实例内存实现）：
 * <ul>
 *   <li>同一「账号 + IP」连续失败 N 次 → 该 IP 对该账号锁定一段时间（正常场景下的防猜测）</li>
 *   <li>同一账号在所有 IP 上累计失败达到 N×10 次 → 账号锁定（分布式爆破兜底）</li>
 * </ul>
 * 只按账号锁定的话，任何人连输 N 次错误密码就能把店主锁在门外；按账号+IP 锁定后，攻击者只能锁住自己。
 */
@Component
public class LoginAttemptGuard {

    /** 账号维度阈值 = 单 IP 阈值 × 该倍数 */
    static final int ACCOUNT_THRESHOLD_FACTOR = 10;

    private final int maxFailures;
    private final Duration lockDuration;
    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public LoginAttemptGuard(AppProperties appProperties) {
        this.maxFailures = appProperties.getAuth().getMaxLoginFailures();
        this.lockDuration = appProperties.getAuth().getLockDuration();
    }

    public boolean isLocked(String username, String ip) {
        long now = System.currentTimeMillis();
        return locked(pairKey(username, ip), now) || locked(accountKey(username), now);
    }

    public void onFailure(String username, String ip) {
        long now = System.currentTimeMillis();
        record(pairKey(username, ip), maxFailures, now);
        record(accountKey(username), maxFailures * ACCOUNT_THRESHOLD_FACTOR, now);
    }

    /** 登录成功只清除本 IP 的计数；账号维度计数保留，避免攻击者夹带一次正确登录清零 */
    public void onSuccess(String username, String ip) {
        attempts.remove(pairKey(username, ip));
    }

    /** 清理长时间无失败记录的条目 */
    @Scheduled(fixedDelay = 10 * 60_000)
    public void evict() {
        long now = System.currentTimeMillis();
        long expireBefore = now - lockDuration.toMillis();
        attempts.entrySet().removeIf(e -> e.getValue().lastFailure < expireBefore && e.getValue().lockedUntil < now);
    }

    private boolean locked(String key, long now) {
        Attempt a = attempts.get(key);
        return a != null && a.lockedUntil > now;
    }

    private void record(String key, int threshold, long now) {
        attempts.compute(key, (k, a) -> {
            // 锁定已过期，或距上次失败已超过锁定时长：重新计数
            boolean stale = a == null || (a.lockedUntil > 0 && a.lockedUntil <= now)
                    || now - a.lastFailure > lockDuration.toMillis();
            Attempt next = stale ? new Attempt() : a;
            next.failures++;
            next.lastFailure = now;
            if (next.failures >= threshold) {
                next.lockedUntil = now + lockDuration.toMillis();
            }
            return next;
        });
    }

    /** 账号区分大小写，与数据库唯一约束保持一致 */
    private static String accountKey(String username) {
        return "u:" + username.trim();
    }

    private static String pairKey(String username, String ip) {
        return "p:" + username.trim() + "|" + ip;
    }

    private static final class Attempt {
        int failures;
        long lastFailure;
        long lockedUntil;
    }
}
