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
    void channelExceptionMarksRefundFailedSoMerchantCanRecover() throws Exception {
        String owner = ownerToken();
        String customer = customerToken("WECHAT", "mock:throw-" + UUID.randomUUID());
        String orderNo = createOrder(customer, null);
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "mock-throw 渠道超时"))))
                .andExpect(status().isOk()).andReturn();
        String refundNo = data(r).path("refundNo").asText();
        // 不再永久停留在 PROCESSING，而是 FAILED，店主可重试 / 线下登记
        mvc.perform(authed(get("/api/v1/m/refunds/" + refundNo), owner))
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.failReason").value(org.hamcrest.Matchers.containsString("渠道调用异常")));
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OFFLINE"));
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("refundStatus").asText()).isEqualTo("FULL");
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

    private String orderStatus(String orderNo) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE order_no = ?", String.class, orderNo);
    }
}
