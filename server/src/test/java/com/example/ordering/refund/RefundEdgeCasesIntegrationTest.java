package com.example.ordering.refund;

import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.task.OrderTasks;
import com.example.ordering.module.wallet.service.WalletService;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 边界用例：待接单退款、原因长度、返还出错与结果丢失、历史渠道订单、并发支付记账、CSV 注入 */
class RefundEdgeCasesIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    OrderTasks tasks;
    @Autowired
    PayService payService;
    @Autowired
    WalletService walletService;
    @Autowired
    org.springframework.transaction.PlatformTransactionManager txManager;

    @Test
    void merchantRefundOnUnacceptedOrderIsRejected() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, "少辣");
        pay(customer, orderNo);
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
        String customer = memberToken();
        String orderNo = createOrder(customer, null);
        pay(customer, orderNo);
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
    void refundErrorStaysProcessingAndIsResubmittedByCompensation() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 首次返还余额时出错（返还事务已回滚）：不能判失败，保持处理中
        failNextRefundBeforeApplying();
        String refundNo = merchantFullRefund(owner, orderNo, "返还出错");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 补偿：查无返还流水 → 用同一退款单号重新提交 → 成功
        expireRefundQueryWindow(refundNo);
        tasks.compensateRefunds();
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("refundStatus").asText()).isEqualTo("FULL");
    }

    @Test
    void lostResultIsReconciledFromWalletNotRefundedTwice() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 余额其实已返还，但之后出错、结果没记下来
        failNextRefundAfterApplying();
        String refundNo = merchantFullRefund(owner, orderNo, "结果丢失");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 店主此时想登记线下退款：后端先查钱包流水，发现已返还 → 直接纠正为成功，不会再退一次
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isEqualTo(3800);
    }

    @Test
    void walletRefundCorrectsFailedAndBlocksOfflineDoubleRefund() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        String refundNo = merchantFullRefund(owner, orderNo, "退款测试");
        // 构造「本地判为失败、余额其实已返还」：直接把本地状态改成 FAILED
        jdbc.update("UPDATE refund SET status = 'FAILED' WHERE refund_no = ?", refundNo);
        jdbc.update("UPDATE orders SET refunded_amount = 0, refund_status = 'NONE' WHERE order_no = ?", orderNo);
        jdbc.update("UPDATE payment SET refunded_amount = 0 WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)", orderNo);
        // 店主点线下退款：先查钱包流水，发现已返还 → 自动改为成功，不再线下退
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isEqualTo(3800);
    }

    @Test
    void processingRefundCanBeRetriedWhenWalletConfirmsNotRefunded() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 首次返还出错：停在处理中。店主不想等补偿任务，手动重试
        failNextRefundBeforeApplying();
        String refundNo = merchantFullRefund(owner, orderNo, "返还出错");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/retry"), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
    }

    @Test
    void processingRefundOfflineRefusedWhileResultUnknown() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        failNextRefundAfterApplying();
        String refundNo = merchantFullRefund(owner, orderNo, "结果未知");
        assertThat(refundStatus(refundNo)).isEqualTo("PROCESSING");
        // 查询钱包流水出错 → 无法确认是否已返还，不允许线下登记（否则可能双退）
        org.mockito.Mockito.doThrow(new IllegalStateException("模拟查询出错")).when(balanceChannel).queryRefund(anyString());
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金")))
                .andExpect(status().isConflict());
        // 查询恢复：发现已返还 → 线下登记请求直接把它纠正为成功，而不是再退一次
        org.mockito.Mockito.doCallRealMethod().when(balanceChannel).queryRefund(anyString());
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
    }

    @Test
    void customerRefundViewHidesStaffAndFailureDetails() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, null);
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());
        failNextRefundDefinitely("余额返还失败（测试）");
        merchantFullRefund(owner, orderNo, "退款测试");
        JsonNode r = getData("/api/v1/c/orders/" + orderNo + "/refunds", customer).get(0);
        assertThat(r.path("status").asText()).isEqualTo("FAILED");
        assertThat(r.path("operatorName").isNull()).isTrue();
        assertThat(r.path("operatorId").isNull()).isTrue();
        assertThat(r.path("failReason").isNull()).isTrue();
        JsonNode m = getData("/api/v1/m/orders/" + orderNo, owner).path("refunds").get(0);
        assertThat(m.path("failReason").asText()).contains("余额返还失败");
    }

    @Test
    void legacyChannelPaymentFailsOnlineRefundAndCanBeSettledOffline() throws Exception {
        String owner = ownerToken();
        String orderNo = acceptedOrder();
        // 历史数据：这笔订单当年是微信支付的（渠道已停用，系统无法线上退款）
        jdbc.update("UPDATE payment SET channel = 'WECHAT' WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)", orderNo);
        String refundNo = merchantFullRefund(owner, orderNo, "历史订单退款");
        assertThat(refundStatus(refundNo)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT fail_reason FROM refund WHERE refund_no = ?", String.class, refundNo)).contains("已停用");
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OFFLINE"));
    }

    @Test
    void walletNeverRefundsMoreThanThePaymentEvenIfOrderChecksAreBypassed() throws Exception {
        String orderNo = acceptedOrder();
        String outTradeNo = jdbc.queryForObject(
                "SELECT out_trade_no FROM payment WHERE order_id = (SELECT id FROM orders WHERE order_no = ?)", String.class, orderNo);
        org.springframework.transaction.support.TransactionTemplate tx = new org.springframework.transaction.support.TransactionTemplate(txManager);
        // 第一笔退 3000：成功
        tx.executeWithoutResult(s -> walletService.refund("CAP-1-" + orderNo, outTradeNo, 3000));
        // 第二笔再退 3000（累计 6000 > 实付 3800）：余额层直接拒绝
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> tx.executeWithoutResult(s -> walletService.refund("CAP-2-" + orderNo, outTradeNo, 3000)))
                .isInstanceOf(com.example.ordering.common.BusinessException.class)
                .hasMessageContaining("超过");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transaction WHERE out_trade_no = ? AND type = 'REFUND'",
                Integer.class, outTradeNo)).isEqualTo(1);
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
        String customer = memberToken();
        String orderNo = createOrder(customer, null);
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());
        // 顾客有一笔待审核的退款申请（占用订单的进行中退款名额）
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("reason", "想退"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("APPLYING"));
        // 此时第二笔支付（并发重复支付）扣费入账
        Long orderId = jdbc.queryForObject("SELECT id FROM orders WHERE order_no = ?", Long.class, orderNo);
        String dupTradeNo = orderNo + "D";
        deductBalanceOutsideCheckout(orderId, dupTradeNo);
        assertThat(payService.onPaySuccess(dupTradeNo, "BAL" + dupTradeNo, 3800, OffsetDateTime.now())).isTrue();
        // 重复支付入账并被自动退回；订单记账与顾客的申请都不受影响
        assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE out_trade_no = ?", String.class, dupTradeNo)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM payment WHERE out_trade_no = ?", Long.class, dupTradeNo)).isEqualTo(3800);
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE order_no = ?", Long.class, orderNo)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refund WHERE order_id = ? AND status = 'APPLYING'", Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void latePaymentOnClosedOrderIsRefundedWithoutTouchingOrderBooks() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, null);
        Long orderId = jdbc.queryForObject("SELECT id FROM orders WHERE order_no = ?", Long.class, orderNo);
        String outTradeNo = orderNo;
        // 支付与关单并发：扣费已发生，但入账前订单已被超时关闭
        deductBalanceOutsideCheckout(orderId, outTradeNo);
        jdbc.update("UPDATE orders SET pay_expire_at = now() - interval '1 minute' WHERE order_no = ?", orderNo);
        tasks.closeExpiredOrders();
        assertThat(orderStatus(orderNo)).isEqualTo("CLOSED");
        long refundedBefore = getData("/api/v1/m/dashboard/today", owner).path("refundedAmount").asLong();

        // 随后入账 → 自动退款，但该款项从未计入订单，不应改动订单记账 / 看板退款
        assertThat(payService.onPaySuccess(outTradeNo, "BAL" + outTradeNo, 3800, OffsetDateTime.now())).isTrue();

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
        String customer = memberToken();
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


    /** 模拟并发支付中的另一笔：建待支付的余额支付单并从会员余额扣费（不经过 /pay 的状态校验） */
    private void deductBalanceOutsideCheckout(Long orderId, String outTradeNo) {
        Map<String, Object> order = jdbc.queryForMap("SELECT customer_id, store_id FROM orders WHERE id = ?", orderId);
        jdbc.update("INSERT INTO payment (order_id, out_trade_no, channel, amount, status) VALUES (?, ?, 'H5', 3800, 'PENDING')",
                orderId, outTradeNo);
        walletService.pay((Long) order.get("customer_id"), (Long) order.get("store_id"), orderId, outTradeNo, 3800);
    }

    /** 下一次返还余额在执行前出错（返还事务回滚，没有返还流水） */
    private void failNextRefundBeforeApplying() {
        org.mockito.Mockito.doThrow(new IllegalStateException("模拟返还出错")).doCallRealMethod()
                .when(balanceChannel).refund(anyString(), anyString(), anyLong());
    }

    /** 下一次返还余额已经提交，但结果没能回写到退款单（返回结果未知，退款单仍是处理中） */
    private void failNextRefundAfterApplying() {
        org.mockito.Mockito.doAnswer(invocation -> {
            invocation.callRealMethod();
            return com.example.ordering.module.pay.channel.RefundResult.unknown();
        }).doCallRealMethod().when(balanceChannel).refund(anyString(), anyString(), anyLong());
    }

    /** 下一次返还余额确定失败 */
    private void failNextRefundDefinitely(String reason) {
        org.mockito.Mockito.doReturn(com.example.ordering.module.pay.channel.RefundResult.failed(reason)).doCallRealMethod()
                .when(balanceChannel).refund(anyString(), anyString(), anyLong());
    }

    private String acceptedOrder() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer, null);
        pay(customer, orderNo);
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
