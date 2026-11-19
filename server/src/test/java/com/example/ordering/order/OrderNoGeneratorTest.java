package com.example.ordering.order;

import com.example.ordering.module.order.service.OrderNoGenerator;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 订单号里的 14 位时间是门店时区（Asia/Shanghai），不能跟着 JVM 默认时区走。
 */
class OrderNoGeneratorTest {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    @Test
    void orderNoEmbedsShanghaiClockRegardlessOfJvmZone() {
        TimeZone previous = TimeZone.getDefault();
        try {
            for (String zone : List.of("UTC", "Europe/Paris", "America/Los_Angeles")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone));
                String orderNo = OrderNoGenerator.orderNo();
                assertThat(orderNo).matches("\\d{20}");
                LocalDateTime embedded = LocalDateTime.parse(orderNo.substring(0, 14), FMT);
                long shanghaiDelta = Math.abs(ChronoUnit.SECONDS.between(embedded, LocalDateTime.now(SHANGHAI)));
                assertThat(shanghaiDelta).as("zone %s order %s", zone, orderNo).isLessThanOrEqualTo(2);

                LocalDateTime jvmNow = LocalDateTime.now();
                if (Math.abs(ChronoUnit.MINUTES.between(jvmNow, LocalDateTime.now(SHANGHAI))) > 30) {
                    long jvmDelta = Math.abs(ChronoUnit.SECONDS.between(embedded, jvmNow));
                    assertThat(jvmDelta).as("order no must not follow JVM zone %s", zone).isGreaterThan(30 * 60);
                }
            }
        } finally {
            TimeZone.setDefault(previous);
        }
    }

    @Test
    void refundNoUsesSameShanghaiClockWithPrefix() {
        TimeZone previous = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        try {
            String refundNo = OrderNoGenerator.refundNo();
            assertThat(refundNo).startsWith("R").matches("R\\d{20}");
            LocalDateTime embedded = LocalDateTime.parse(refundNo.substring(1, 15), FMT);
            long delta = Math.abs(ChronoUnit.SECONDS.between(embedded, LocalDateTime.now(SHANGHAI)));
            assertThat(delta).isLessThanOrEqualTo(2);
        } finally {
            TimeZone.setDefault(previous);
        }
    }
}
