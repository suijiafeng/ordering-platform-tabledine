package com.example.ordering.task;

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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 定时任务：直接调用 OrderTasks 的方法，并通过回拨数据库时间模拟「已过期」。
 * 各任务只会处理被回拨时间的订单，不影响其他测试类产生的数据。
 */
class OrderTasksIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    OrderTasks tasks;

    @Test
    void expiredUnpaidOrderIsClosed() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer);
        String fresh = createOrder(customer);
        expirePayWindow(orderNo);

        tasks.closeExpiredOrders();

        assertThat(orderStatus(orderNo)).isEqualTo("CLOSED");
        assertThat(orderStatus(fresh)).isEqualTo("PENDING_PAY");  // 未过期的不受影响
    }

    @Test
    void unacceptedPaidOrderIsCancelledAndRefundedAfterTimeout() throws Exception {
        String customer = memberToken();
        String stale = createOrder(customer);
        String recent = createOrder(customer);
        pay(customer, stale);
        pay(customer, recent);
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
        String customer = memberToken();
        String orderNo = createOrder(customer);
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        // 首次返还余额出错 → 保持处理中
        org.mockito.Mockito.doThrow(new IllegalStateException("模拟返还出错")).doCallRealMethod()
                .when(balanceChannel).refund(anyString(), anyString(), anyLong());
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "补偿测试"))))
                .andExpect(status().isOk()).andReturn();
        String refundNo = data(r).path("refundNo").asText();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");

        // 未超过查询间隔：不处理
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");

        // 超过间隔后：第一次查询出错（结果未知）→ 只刷新 updated_at，不改状态
        org.mockito.Mockito.doThrow(new IllegalStateException("模拟查询出错")).doCallRealMethod()
                .when(balanceChannel).queryRefund(anyString());
        jdbc.update("UPDATE refund SET updated_at = now() - interval '1 hour' WHERE refund_no = ?", refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 每轮处理后 updated_at 被刷新（让其他退款单轮到），下一轮需再次超过查询间隔
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 再次超过间隔：查无返还流水 → 用同一退款单号重新提交 → 成功
        jdbc.update("UPDATE refund SET updated_at = now() - interval '1 hour' WHERE refund_no = ?", refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refund_status FROM orders WHERE order_no = ?", String.class, orderNo)).isEqualTo("FULL");
    }

    @Test
    void newCountCarriesPendingOrderNosForSetBasedDedup() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer);
        pay(customer, orderNo);
        JsonNode c = getData("/api/v1/m/orders/new-count", staffToken());
        assertThat(c.path("pendingOrderNos").findValuesAsText("").isEmpty()).isTrue();
        java.util.List<String> nos = new java.util.ArrayList<>();
        c.path("pendingOrderNos").forEach(n -> nos.add(n.asText()));
        assertThat(nos).contains(orderNo);
        assertThat(c.path("pendingAcceptCount").asLong()).isEqualTo(nos.size());
    }

    @Test
    void newCountReportsRefundApplicationsOverdueForReview() throws Exception {
        String customer = memberToken();
        String owner = ownerToken();
        String orderNo = createOrder(customer);
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(toJson(java.util.Map.of("reason", "不想要了"))))
                .andExpect(status().isOk()).andReturn();
        String refundNo = data(r).path("refundNo").asText();

        // 刚申请：不算超时
        long overdueBefore = getData("/api/v1/m/orders/new-count", owner).path("overdueRefundCount").asLong();
        // 申请时间回拨 3 小时 → 超过 2 小时未审核，计入提醒
        jdbc.update("UPDATE refund SET created_at = now() - interval '3 hours' WHERE refund_no = ?", refundNo);
        long overdueAfter = getData("/api/v1/m/orders/new-count", owner).path("overdueRefundCount").asLong();
        assertThat(overdueAfter).isEqualTo(overdueBefore + 1);
        // 定时任务对同一批数据只记日志，不抛异常、不改状态
        tasks.remindApplyingRefunds();
        assertThat(jdbc.queryForObject("SELECT status FROM refund WHERE refund_no = ?", String.class, refundNo)).isEqualTo("APPLYING");
    }

    @Test
    void remindAndCompensateDoNotThrowOnEmptyOrStaleData() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer);
        jdbc.update("UPDATE orders SET created_at = now() - interval '1 hour' WHERE order_no = ?", orderNo);
        tasks.compensateRefunds();
        tasks.remindApplyingRefunds();
        assertThat(orderStatus(orderNo)).isEqualTo("PENDING_PAY");  // 未到支付截止时间，保持待支付
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
