package com.example.ordering.refund;

import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 生产配置下返还余额在独立线程执行（其他测试为了断言方便用同步执行）：
 * 接口在退款单事务提交后立即返回「处理中」，余额稍后由退款线程退回。
 */
@TestPropertySource(properties = "app.refund.async=true")
class RefundAsyncExecutionTest extends AbstractIntegrationTest {

    @Test
    void refundIsSettledOnRefundThreadAfterResponse() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long balanceBefore = getData("/api/v1/c/me", customer).path("balance").asLong();
        Map<String, Object> item = Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1);
        MvcResult created = mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1",
                                "items", List.of(item), "peopleCount", 1))))
                .andExpect(status().isOk()).andReturn();
        String orderNo = data(created).path("orderNo").asText();
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("type", "FULL", "reason", "异步返还"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"))
                .andReturn();
        String refundNo = data(r).path("refundNo").asText();

        // 余额由退款线程退回：最多等 5 秒
        String status = null;
        for (int i = 0; i < 50 && !"SUCCESS".equals(status); i++) {
            Thread.sleep(100);
            status = jdbc.queryForObject("SELECT status FROM refund WHERE refund_no = ?", String.class, refundNo);
        }
        assertThat(status).isEqualTo("SUCCESS");
        assertThat(getData("/api/v1/c/me", customer).path("balance").asLong()).isEqualTo(balanceBefore);
        assertThat(jdbc.queryForObject("SELECT refund_status FROM orders WHERE order_no = ?", String.class, orderNo)).isEqualTo("FULL");
    }
}
