package com.example.ordering.audit;

import com.example.ordering.module.audit.web.ViewAuditThrottleAccess;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class ViewAuditThrottleTest {

    @Test
    void sameViewIsRecordedOncePerWindow() {
        AtomicLong now = new AtomicLong(1_000_000);
        var throttle = ViewAuditThrottleAccess.withClock(now::get);
        assertThat(throttle.shouldRecord("1|STAFF|1|/api/v1/m/members|{}")).isTrue();
        now.addAndGet(5_000);
        assertThat(throttle.shouldRecord("1|STAFF|1|/api/v1/m/members|{}")).isFalse();
        // 换了查询条件、换了操作人：照常记录
        assertThat(throttle.shouldRecord("1|STAFF|1|/api/v1/m/members|{\"page\":2}")).isTrue();
        assertThat(throttle.shouldRecord("1|STAFF|2|/api/v1/m/members|{}")).isTrue();
        // 窗口过后再记一条
        now.addAndGet(ViewAuditThrottleAccess.WINDOW_MS);
        assertThat(throttle.shouldRecord("1|STAFF|1|/api/v1/m/members|{}")).isTrue();
    }
}
