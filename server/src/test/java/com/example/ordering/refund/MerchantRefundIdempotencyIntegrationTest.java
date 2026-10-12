package com.example.ordering.refund;

import com.example.ordering.module.pay.channel.RefundResult;
import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 请求身份必须跨越退款完成状态存活；只有确认创建新的意图后才允许另一笔部分退款。 */
class MerchantRefundIdempotencyIntegrationTest extends AbstractIntegrationTest {

    @Test
    void hundredYuanPaidTenYuanSucceededLostResponseRetryReturnsOneTenYuanRefund() throws Exception {
        PaidOrder order = paidOrder();
        Map<String, Object> request = customRequest(UUID.randomUUID().toString(), 1000, "售后补偿");
        // 客户端丢失这次响应；服务端已提交并成功返还 10 元。
        postRefund(order, request);
        String refundNo = jdbc.queryForObject("SELECT refund_no FROM refund WHERE client_request_id = ?",
                String.class, request.get("clientRequestId"));
        assertThat(refundStatus(refundNo)).isEqualTo("SUCCESS");

        JsonNode retried = data(postRefund(order, request));
        assertThat(retried.path("refundNo").asText()).isEqualTo(refundNo);
        assertThat(retried.path("status").asText()).isEqualTo("SUCCESS");
        assertThat(retried.path("amount").asLong()).isEqualTo(1000);
        assertBooks(order, 1, 1000);

        // 同样金额、不同请求编号是一次明确的新退款，不应被内容指纹错误合并。
        postRefund(order, customRequest(UUID.randomUUID().toString(), 1000, "售后补偿"));
        assertBooks(order, 2, 2000);
    }

    @Test
    void fullAndItemRetriesReturnOriginalEvenWithNoRefundableAmountOrQuantity() throws Exception {
        for (String type : List.of("FULL", "ITEM")) {
            PaidOrder order = paidOrder();
            Map<String, Object> request = new java.util.HashMap<>(Map.of("clientRequestId", UUID.randomUUID().toString(),
                    "type", type, "reason", "全退"));
            if ("ITEM".equals(type)) {
                Long itemId = jdbc.queryForObject("SELECT id FROM order_item WHERE order_id = ?", Long.class, order.orderId());
                request.put("items", List.of(Map.of("orderItemId", itemId, "quantity", 1)));
            }
            String originalNo = data(postRefund(order, request)).path("refundNo").asText();
            JsonNode retried = data(postRefund(order, request));
            assertThat(retried.path("refundNo").asText()).isEqualTo(originalNo);
            assertThat(retried.path("status").asText()).isEqualTo("SUCCESS");
            assertBooks(order, 1, 10000);
        }
    }

    @Test
    void sameIdRejectsChangedAmountReasonTypeItemsAndOrder() throws Exception {
        PaidOrder order = paidOrder();
        String requestId = UUID.randomUUID().toString();
        postRefund(order, customRequest(requestId, 1000, "补偿"));
        List<Map<String, Object>> conflicts = new ArrayList<>();
        conflicts.add(customRequest(requestId, 2000, "补偿"));
        conflicts.add(customRequest(requestId, 1000, "新的原因"));
        conflicts.add(Map.of("clientRequestId", requestId, "type", "FULL", "reason", "补偿", "amount", 1000));
        Long itemId = jdbc.queryForObject("SELECT id FROM order_item WHERE order_id = ?", Long.class, order.orderId());
        conflicts.add(Map.of("clientRequestId", requestId, "type", "CUSTOM", "reason", "补偿", "amount", 1000,
                "items", List.of(Map.of("orderItemId", itemId, "quantity", 1))));
        for (Map<String, Object> changed : conflicts) {
            mvc.perform(authed(post("/api/v1/m/orders/" + order.orderNo() + "/refunds"), order.owner())
                            .contentType(MediaType.APPLICATION_JSON).content(toJson(changed)))
                    .andExpect(status().isConflict());
        }
        PaidOrder other = paidOrder();
        mvc.perform(authed(post("/api/v1/m/orders/" + other.orderNo() + "/refunds"), other.owner())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(customRequest(requestId, 1000, "补偿"))))
                .andExpect(status().isConflict());
        assertBooks(order, 1, 1000);
        assertBooks(other, 0, 0);
    }

    @Test
    void concurrentSameIdHasOneRefundAndOneWalletCredit() throws Exception {
        PaidOrder order = paidOrder();
        Map<String, Object> request = customRequest(UUID.randomUUID().toString(), 1000, "双击重试");
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(executor.submit(() -> {
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return data(postRefund(order, request)).path("refundNo").asText();
                }));
            }
            start.countDown();
            assertThat(futures.get(0).get(10, TimeUnit.SECONDS)).isEqualTo(futures.get(1).get(10, TimeUnit.SECONDS));
            assertBooks(order, 1, 1000);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void processingAndFailedRetriesReturnOriginalWithoutSubmittingAgain() throws Exception {
        for (RefundResult result : List.of(RefundResult.unknown(), RefundResult.failed("模拟明确失败"))) {
            PaidOrder order = paidOrder();
            doReturn(result).when(balanceChannel).refund(anyString(), anyString(), anyLong());
            Map<String, Object> request = customRequest(UUID.randomUUID().toString(), 1000, "同一申请");
            String refundNo = data(postRefund(order, request)).path("refundNo").asText();
            assertThat(data(postRefund(order, request)).path("refundNo").asText()).isEqualTo(refundNo);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refund WHERE order_id = ?", Integer.class, order.orderId())).isEqualTo(1);
            org.mockito.Mockito.verify(balanceChannel).refund(org.mockito.ArgumentMatchers.eq(refundNo), anyString(), anyLong());
        }
    }

    @Test
    void missingOrInvalidIdsFailClosedForOldClients() throws Exception {
        PaidOrder order = paidOrder();
        for (Map<String, Object> request : List.of(
                Map.<String, Object>of("type", "CUSTOM", "amount", 1000, "reason", "旧客户端"),
                customRequest("", 1000, "旧客户端"), customRequest("x".repeat(65), 1000, "编号过长"))) {
            mvc.perform(authed(post("/api/v1/m/orders/" + order.orderNo() + "/refunds"), order.owner())
                            .contentType(MediaType.APPLICATION_JSON).content(toJson(request)))
                    .andExpect(status().isUnprocessableEntity());
        }
        assertBooks(order, 0, 0);
    }

    @Test
    void databaseUniqueConstraintStillProtectsRequestIdAfterSuccess() throws Exception {
        PaidOrder order = paidOrder();
        String requestId = UUID.randomUUID().toString();
        postRefund(order, customRequest(requestId, 1000, "唯一索引"));
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO refund (refund_no, store_id, order_id, type, initiator, amount, status,
                                    client_request_id, request_fingerprint)
                SELECT ?, store_id, order_id, type, initiator, amount, 'SUCCESS', client_request_id, request_fingerprint
                FROM refund WHERE client_request_id = ?
                """, "DUP" + UUID.randomUUID().toString().replace("-", "").substring(0, 24), requestId))
                .isInstanceOf(DuplicateKeyException.class);
        assertBooks(order, 1, 1000);
    }

    private PaidOrder paidOrder() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        Long dishId = jdbc.queryForObject("""
                INSERT INTO dish (store_id, category_id, name, price)
                SELECT store_id, category_id, ?, 10000 FROM dish WHERE id = 1 RETURNING id
                """, Long.class, "退款幂等测试菜品");
        JsonNode created = data(mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1", "peopleCount", 1,
                                "items", List.of(Map.of("dishId", dishId, "quantity", 1, "specItemIds", List.of(), "addonItemIds", List.of()))))))
                .andExpect(status().isOk()).andReturn());
        String orderNo = created.path("orderNo").asText();
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());
        long balanceAfterPay = getData("/api/v1/c/me", customer).path("balance").asLong();
        return new PaidOrder(orderNo, jdbc.queryForObject("SELECT id FROM orders WHERE order_no = ?", Long.class, orderNo),
                owner, customer, balanceAfterPay);
    }

    private MvcResult postRefund(PaidOrder order, Map<String, Object> request) throws Exception {
        return mvc.perform(authed(post("/api/v1/m/orders/" + order.orderNo() + "/refunds"), order.owner())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(request)))
                .andExpect(status().isOk()).andReturn();
    }

    private static Map<String, Object> customRequest(String requestId, long amountInCents, String reason) {
        return Map.of("clientRequestId", requestId, "type", "CUSTOM", "amount", amountInCents, "reason", reason);
    }

    private String refundStatus(String refundNo) {
        return jdbc.queryForObject("SELECT status FROM refund WHERE refund_no = ?", String.class, refundNo);
    }

    private void assertBooks(PaidOrder order, int refundCount, long refundedInCents) throws Exception {
        assertThat(jdbc.queryForObject("SELECT pay_amount FROM orders WHERE id = ?", Long.class, order.orderId())).isEqualTo(10000);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refund WHERE order_id = ?", Integer.class, order.orderId())).isEqualTo(refundCount);
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM orders WHERE id = ?", Long.class, order.orderId())).isEqualTo(refundedInCents);
        assertThat(jdbc.queryForObject("SELECT refunded_amount FROM payment WHERE order_id = ?", Long.class, order.orderId())).isEqualTo(refundedInCents);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transaction WHERE order_id = ? AND type = 'REFUND'",
                Integer.class, order.orderId())).isEqualTo(refundCount);
        assertThat(jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM wallet_transaction WHERE order_id = ? AND type = 'REFUND'",
                Long.class, order.orderId())).isEqualTo(refundedInCents);
        assertThat(getData("/api/v1/c/me", order.customer()).path("balance").asLong()).isEqualTo(order.balanceAfterPay() + refundedInCents);
    }

    private record PaidOrder(String orderNo, Long orderId, String owner, String customer, long balanceAfterPay) {
    }
}
