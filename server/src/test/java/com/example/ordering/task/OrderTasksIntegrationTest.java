package com.example.ordering.task;

import com.example.ordering.common.Platform;
import com.example.ordering.module.pay.channel.PayChannelRegistry;
import com.example.ordering.module.task.OrderTasks;
import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 定时任务：直接调用 OrderTasks 的方法，并通过回拨数据库时间模拟「已过期」。
 * 各任务只会处理被回拨时间的订单，不影响其他测试类产生的数据。
 */
class OrderTasksIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    OrderTasks tasks;
    @Autowired
    PayChannelRegistry channels;

    @Test
    void expiredUnpaidOrderIsClosed() throws Exception {
        String customer = customerToken("WECHAT", "mock:close-" + UUID.randomUUID());
        String orderNo = createOrder(customer);
        String fresh = createOrder(customer);
        expirePayWindow(orderNo);

        tasks.closeExpiredOrders();

        assertThat(orderStatus(orderNo)).isEqualTo("CLOSED");
        assertThat(orderStatus(fresh)).isEqualTo("PENDING_PAY");  // 未过期的不受影响
    }

    @Test
    void expiredOrderPaidAtChannelIsRecoveredInsteadOfClosed() throws Exception {
        String customer = customerToken("WECHAT", "mock:late-" + UUID.randomUUID());
        String orderNo = createOrder(customer);
        MvcResult pay = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                .andExpect(status().isOk()).andReturn();
        // 渠道侧已支付，但回调丢失（不走 mock-pay 接口）
        channels.mock(Platform.WECHAT).markPaid(data(pay).path("outTradeNo").asText());
        expirePayWindow(orderNo);

        tasks.closeExpiredOrders();

        assertThat(orderStatus(orderNo)).isIn("PAID", "MAKING");
        assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)",
                String.class, orderNo)).isEqualTo("SUCCESS");
    }

    @Test
    void expiredOrderIsNotClosedWhileChannelQueryFails() throws Exception {
        String customer = customerToken("WECHAT", "mock:qerr-" + UUID.randomUUID());
        String orderNo = createOrder(customer);
        MvcResult pay = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                .andExpect(status().isOk()).andReturn();
        String outTradeNo = data(pay).path("outTradeNo").asText();
        expirePayWindow(orderNo);
        channels.mock(Platform.WECHAT).simulateQueryError(outTradeNo, true);
        try {
            // 渠道故障：查不到不等于没付，关单任务和顾客再次支付都不能关单
            tasks.closeExpiredOrders();
            assertThat(orderStatus(orderNo)).isEqualTo("PENDING_PAY");
            mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                    .andExpect(status().isConflict())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message").value("正在确认支付结果，请稍后刷新"));
            assertThat(orderStatus(orderNo)).isEqualTo("PENDING_PAY");
        } finally {
            channels.mock(Platform.WECHAT).simulateQueryError(outTradeNo, false);
        }
        // 渠道恢复后确认未支付 → 正常关单
        tasks.closeExpiredOrders();
        assertThat(orderStatus(orderNo)).isEqualTo("CLOSED");
    }

    @Test
    void unacceptedPaidOrderIsCancelledAndRefundedAfterTimeout() throws Exception {
        String customer = customerToken("ALIPAY", "mock:noaccept-" + UUID.randomUUID());
        String stale = createOrder(customer);
        String recent = createOrder(customer);
        payMock(customer, stale);
        payMock(customer, recent);
        // 超时时长以店铺配置为准，回拨到远超该时长
        jdbc.update("UPDATE orders SET paid_at = now() - interval '2 hours' WHERE order_no = ?", stale);

        tasks.autoRefundUnaccepted();

        JsonNode detail = getData("/api/v1/c/orders/" + stale, customer);
        assertThat(detail.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
        assertThat(detail.path("refunds").get(0).path("initiator").asText()).isEqualTo("SYSTEM");
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("SUCCESS");
        assertThat(orderStatus(recent)).isEqualTo("PAID");  // 刚支付的订单不受影响

        // 再跑一次：幂等，不会重复退款
        tasks.autoRefundUnaccepted();
        Integer refunds = jdbc.queryForObject(
                "SELECT COUNT(*) FROM refund WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)", Integer.class, stale);
        assertThat(refunds).isEqualTo(1);
    }

    @Test
    void processingRefundIsSettledByCompensation() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:comp-" + UUID.randomUUID());
        String orderNo = createOrder(customer);
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        // 原因含 mock-pending → 渠道返回处理中
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "mock-pending 测试"))))
                .andExpect(status().isOk()).andReturn();
        String refundNo = data(r).path("refundNo").asText();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");

        // 未超过查询间隔：不处理
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");

        // 超过间隔后：模拟渠道首次查询仍处理中，第二次成功
        jdbc.update("UPDATE refund SET updated_at = now() - interval '1 hour' WHERE refund_no = ?", refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 每轮处理后 updated_at 被刷新（让其他退款单轮到），下一轮需再次超过查询间隔
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        jdbc.update("UPDATE refund SET updated_at = now() - interval '1 hour' WHERE refund_no = ?", refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refund_status FROM orders WHERE order_no = ?", String.class, orderNo)).isEqualTo("FULL");
    }

    @Test
    void remindAndCompensatePaymentsDoNotThrowOnEmptyOrStaleData() throws Exception {
        String customer = customerToken("WECHAT", "mock:misc-" + UUID.randomUUID());
        String orderNo = createOrder(customer);
        jdbc.update("UPDATE orders SET created_at = now() - interval '1 hour' WHERE order_no = ?", orderNo);
        tasks.compensatePayments();
        tasks.remindApplyingRefunds();
        assertThat(orderStatus(orderNo)).isEqualTo("PENDING_PAY");  // 渠道未支付，保持待支付
    }

    // ---------------------------------------------------------------

    private String createOrder(String customer) throws Exception {
        Map<String, Object> item = Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1);
        Map<String, Object> body = Map.of("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1",
                "items", List.of(item), "peopleCount", 2);
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk()).andReturn();
        return data(r).path("orderNo").asText();
    }

    private void payMock(String customer, String orderNo) throws Exception {
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/mock-pay"), customer)).andExpect(status().isOk());
    }

    private void expirePayWindow(String orderNo) {
        jdbc.update("UPDATE orders SET pay_expire_at = now() - interval '1 minute' WHERE order_no = ?", orderNo);
    }

    private String orderStatus(String orderNo) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE order_no = ?", String.class, orderNo);
    }

    private String refundStatus(String refundNo) {
        return jdbc.queryForObject("SELECT status FROM refund WHERE refund_no = ?", String.class, refundNo);
    }
}
