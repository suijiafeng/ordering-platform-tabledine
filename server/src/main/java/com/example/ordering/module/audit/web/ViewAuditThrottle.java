package com.example.ordering.module.audit.web;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * 「敏感查看」去重：同一操作人以相同参数查看同一接口，10 分钟内只记一条。
 * 页面每 5 秒的后台同步、进入页面时的重复加载都会命中同一查询，不去重的话一个打开的标签页每分钟写 12 条。
 * 换了查询条件（翻页、搜索、换日期）仍然逐条记录；失败的查看不去重。只在本进程内存里计时，重启后重新开始。
 */
@Component
public class ViewAuditThrottle {

    static final long WINDOW_MS = 10 * 60 * 1000L;
    private static final int PRUNE_THRESHOLD = 10_000;

    private final ConcurrentHashMap<String, Long> lastRecorded = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public ViewAuditThrottle() {
        this(System::currentTimeMillis);
    }

    ViewAuditThrottle(LongSupplier clock) {
        this.clock = clock;
    }

    /** 返回 true 表示这次需要记录 */
    public boolean shouldRecord(String key) {
        long now = clock.getAsLong();
        boolean[] record = {false};
        lastRecorded.compute(key, (k, last) -> {
            if (last == null || now - last >= WINDOW_MS) {
                record[0] = true;
                return now;
            }
            return last;
        });
        if (lastRecorded.size() > PRUNE_THRESHOLD) {
            lastRecorded.values().removeIf(t -> now - t >= WINDOW_MS);
        }
        return record[0];
    }
}
