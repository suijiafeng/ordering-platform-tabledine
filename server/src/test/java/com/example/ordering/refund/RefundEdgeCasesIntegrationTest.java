package com.example.ordering.refund;

import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.task.OrderTasks;
import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 代码审查后补充的边界用例：待接单退款、原因长度、渠道异常、迟到支付记账、CSV 注入 */
class RefundEdgeCasesIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    OrderTasks tasks;
    @Autowired
    PayService payService;

    @Test
    void merchantRefundOnUnacceptedOrderIsRejected() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:paidref-" + UUID.randomUUID());
        String orderNo = createOrder(customer, "少辣");
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "不想做了"))))
                .andExpect(status().isConflict());
        assertThat(orderStatus(orderNo)).isEqualTo("PAID");  // 仍可正常拒单
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/reject"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "忙不过来")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
        // 退款在事务提交后向渠道发起，重新拉取详情
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("refundStatus").asText()).isEqualTo("FULL");
    }

    @Test
    void cancelReasonLengthIsBoundedBelowColumnLimit() throws Exception {
        String customer = customerToken("WECHAT", "mock:reason-" + UUID.randomUUID());
        String orderNo = createOrder(customer, null);
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "长".repeat(201))))
                .andExpect(status().isUnprocessableEntity());
        // 200 字 + 前缀「顾客取消：」仍在 255 内：取消成功且退款单原因完整写入
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "长".repeat(200))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.refunds[0].reason").value("顾客取消：" + "长".repeat(200)));
    }

    @Test
    void channelTimeoutStaysProcessingAndIsResubmittedByCompensation() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 首次提交时请求没到达渠道（mock-throw）：不能判失败，保持处理中
        String refundNo = merchantFullRefund(owner, orderNo, "mock-throw 渠道超时");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 补偿：渠道查无此单 → 用同一退款单号重新提交 → 成功
        expireRefundQueryWindow(refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("refundStatus").asText()).isEqualTo("FULL");
    }

    @Test
    void lostResponseIsReconciledFromChannelNotRefundedTwice() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 渠道其实已退款成功，但响应超时丢失（mock-lost）
        String refundNo = merchantFullRefund(owner, orderNo, "mock-lost 响应丢失");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 处理中不能登记线下退款（只有失败才行）
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isConflict());
        expireRefundQueryWindow(refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isEqualTo(3800);
    }

    @Test
    void lateChannelSuccessCorrectsFailedAndBlocksOfflineDoubleRefund() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        String refundNo = merchantFullRefund(owner, orderNo, "退款测试");
        // 构造「本地判为失败、渠道其实成功」：直接把本地状态改成 FAILED
        jdbc.update("UPDATE refund SET status = 'FAILED' WHERE refund_no = ?", refundNo);
        jdbc.update("UPDATE orders SET refunded_amount = 0, refund_status = 'NONE' WHERE order_no = ?", orderNo);
        jdbc.update("UPDATE payment SET refunded_amount = 0 WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)", orderNo);
        // 店主点线下退款：先向渠道确认，发现已成功 → 自动改为成功，不再线下退
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isEqualTo(3800);
    }

    @Test
    void definiteChannelFailureCanStillBeSettledOffline() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        String refundNo = merchantFullRefund(owner, orderNo, "mock-fail 余额不足");
        assertThat(refundStatus(refundNo)).isEqualTo("FAILED");
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OFFLINE"));
    }

    @Test
    void staffCannotInitiateMerchantRefund() throws Exception {
        String orderNo = acceptedOrder();
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), staffToken())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("type", "FULL", "reason", "店员想退"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void duplicatePaymentRefundIsNotBlockedByPendingOrderRefund() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:dup-" + UUID.randomUUID());
        String orderNo = createOrder(customer, null);
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());
        // 顾客有一笔待审核的退款申请（占用订单的进行中退款名额）
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("reason", "想退"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("APPLYING"));
        // 此时第二笔支付（重复支付）成功到账
        Long orderId = jdbc.queryForObject("SELECT id FROM orders WHERE order_no = ?", Long.class, orderNo);
        String dupTradeNo = orderNo + "D";
        jdbc.update("INSERT INTO payment (order_id, out_trade_no, channel, amount, status) VALUES (?, ?, 'WECHAT', 3800, 'PENDING')",
                orderId, dupTradeNo);
        assertThat(payService.onPaySuccess(dupTradeNo, "DUP-TXN-" + orderNo, 3800, OffsetDateTime.now())).isTrue();
        // 重复支付入账并被自动退回；订单记账与顾客的申请都不受影响
        assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE out_trade_no = ?", String.class, dupTradeNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM payment WHERE out_trade_no = ?", Long.class, dupTradeNo)).isEqualTo(3800);
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refund WHERE order_id = ? AND status = 'APPLYING'", Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void latePaymentOnClosedOrderIsRefundedWithoutTouchingOrderBooks() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:late-" + UUID.randomUUID());
        String orderNo = createOrder(customer, null);
        MvcResult pay = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                .andExpect(status().isOk()).andReturn();
        String outTradeNo = data(pay).path("outTradeNo").asText();
        jdbc.update("UPDATE orders SET pay_expire_at = now() - interval '1 minute' WHERE order_no = ?", orderNo);
        tasks.closeExpiredOrders();
        assertThat(orderStatus(orderNo)).isEqualTo("CLOSED");
        long refundedBefore = getData("/api/v1/m/dashboard/today", owner).path("refundedAmount").asLong();

        // 关单后渠道才送达支付成功通知 → 自动退款，但该款项从未计入订单，不应改动订单记账 / 看板退款
        assertThat(payService.onPaySuccess(outTradeNo, "LATE-TXN", 3800, OffsetDateTime.now())).isTrue();

        JsonNode detail = getData("/api/v1/c/orders/" + orderNo, customer);
        assertThat(detail.path("status").asText()).isEqualTo("CLOSED");
        assertThat(detail.path("refundStatus").asText()).isEqualTo("NONE");
        assertThat(detail.path("refundedAmount").asLong()).isZero();
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("SUCCESS");
        assertThat(detail.path("refunds").get(0).path("initiator").asText()).isEqualTo("SYSTEM");
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM payment WHERE out_trade_no = ?", Long.class, outTradeNo)).isEqualTo(3800);
        assertThat(getData("/api/v1/m/dashboard/today", owner).path("refundedAmount").asLong()).isEqualTo(refundedBefore);
    }

    @Test
    void csvExportNeutralizesFormulaInjection() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:csv-" + UUID.randomUUID());
        String orderNo = createOrder(customer, "=HYPERLINK(\"http://evil.example/\",\"open\")");
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        MvcResult r = mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), owner))
                .andExpect(status().isOk()).andReturn();
        String csv = r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        String line = csv.lines().filter(l -> l.contains(orderNo)).findFirst().orElseThrow();
        assertThat(line).contains("\"'=HYPERLINK(\"\"http://evil.example/\"\"").doesNotContain(",=HYPERLINK");
    }

    // ---------------------------------------------------------------

    private String createOrder(String customer, String remark) throws Exception {
        Map<String, Object> item = Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1);
        Map<String, Object> body = new java.util.HashMap<>(Map.of("clientRequestId", UUID.randomUUID().toString(),
                "qrToken", "dev-table-a1", "items", List.of(item), "peopleCount", 2));
        if (remark != null) {
            body.put("remark", remark);
        }
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk()).andReturn();
        return data(r).path("orderNo").asText();
    }

    private void payMock(String customer, String orderNo) throws Exception {
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/mock-pay"), customer)).andExpect(status().isOk());
    }

    private String acceptedOrder() throws Exception {
        String customer = customerToken("WECHAT", "mock:acc-" + UUID.randomUUID());
        String orderNo = createOrder(customer, null);
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), ownerToken())).andExpect(status().isOk());
        return orderNo;
    }

    private String merchantFullRefund(String owner, String orderNo, String reason) throws Exception {
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("type", "FULL", "reason", reason))))
                .andExpect(status().isOk()).andReturn();
        return data(r).path("refundNo").asText();
    }

    private String refundStatus(String refundNo) {
        return jdbc.queryForObject("SELECT status FROM refund WHERE refund_no = ?", String.class, refundNo);
    }

    private void expireRefundQueryWindow(String refundNo) {
        jdbc.update("UPDATE refund SET updated_at = now() - interval '1 hour' WHERE refund_no = ?", refundNo);
    }

    private String orderStatus(String orderNo) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE order_no = ?", String.class, orderNo);
    }
}
