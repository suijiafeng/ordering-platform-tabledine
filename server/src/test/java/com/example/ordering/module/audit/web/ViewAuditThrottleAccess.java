package com.example.ordering.module.audit.web;

import java.util.function.LongSupplier;

/** 测试用：访问 ViewAuditThrottle 的包内构造器和时间窗口 */
public final class ViewAuditThrottleAccess {
    public static final long WINDOW_MS = ViewAuditThrottle.WINDOW_MS;

    private ViewAuditThrottleAccess() {
    }

    public static ViewAuditThrottle withClock(LongSupplier clock) {
        return new ViewAuditThrottle(clock);
    }
}
