package com.example.ordering.ratelimit;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.security.LoginUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }
        RateLimit limit = hm.getMethodAnnotation(RateLimit.class);
        if (limit == null) {
            return true;
        }
        String key = hm.getMethod().getDeclaringClass().getSimpleName() + "#" + hm.getMethod().getName()
                + ":" + subject(request);
        long windowMillis = limit.windowSeconds() * 1000L;
        long now = System.currentTimeMillis();
        Window w = windows.compute(key, (k, old) ->
                (old == null || now - old.start >= windowMillis) ? new Window(now, windowMillis) : old);
        if (w.count.incrementAndGet() > limit.permits()) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }
        return true;
    }

    /** 每分钟清理过期窗口，防止内存增长 */
    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        long now = System.currentTimeMillis();
        windows.entrySet().removeIf(e -> now - e.getValue().start >= e.getValue().length);
    }

    private static String subject(HttpServletRequest request) {
        LoginUser user = LoginUser.currentOrNull();
        if (user != null) {
            return user.type() + ":" + user.id();
        }
        return "ip:" + ClientIp.of(request);
    }

    private static final class Window {
        final long start;
        final long length;
        final AtomicInteger count = new AtomicInteger();

        Window(long start, long length) {
            this.start = start;
            this.length = length;
        }
    }
}
