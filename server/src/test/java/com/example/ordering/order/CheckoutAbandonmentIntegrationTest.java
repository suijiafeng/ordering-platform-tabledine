package com.example.ordering.order;

import com.example.ordering.module.order.dto.AbandonCheckoutResult;
import com.example.ordering.module.order.dto.CreateOrderRequest;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.service.CustomerOrderService;
import com.example.ordering.security.LoginUser;
import com.example.ordering.security.UserType;
import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** PostgreSQL 行锁与事务回滚的真实并发覆盖；无 Docker 时按基类规则跳过。 */
class CheckoutAbandonmentIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private CustomerOrderService customerOrderService;
    @Autowired
    private TransactionTemplate tx;
    @SpyBean
    private OrderItemMapper orderItemMapper;

    @Test
    void absentRequestCanBeAbandonedRepeatedlyAndLateCreateNeverTouchesStockOrMoney() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);

        for (int attempt = 0; attempt < 2; attempt++) {
            JsonNode result = abandon(customer, requestId);
            assertThat(result.path("abandoned").asBoolean()).isTrue();
            assertThat(result.path("order").isNull()).isTrue();
            assertThat(create(customer, requestId).getResponse().getStatus()).isEqualTo(409);
        }

        assertThat(getData(lookupUrl(requestId), customer).isNull()).isTrue();
        assertThat(orderCount(customerId, requestId)).isZero();
        assertThat(ledgerCount(customerId, requestId)).isEqualTo(1);
        assertThat(isAbandoned(customerId, requestId)).isTrue();
        assertThat(stockSnapshot()).isEqualTo(stock);
        assertThat(financialSnapshot(customerId)).isEqualTo(finances);
    }

    @Test
    void existingPendingOrderIsReturnedWithoutCancellationPaymentOrStockRestoration() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        JsonNode created = data(create(customer, requestId));
        String orderNo = created.path("orderNo").asText();
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);
        Map<String, Object> order = jdbc.queryForMap("SELECT * FROM orders WHERE order_no = ?", orderNo);
        int logs = jdbc.queryForObject("SELECT COUNT(*) FROM order_status_log WHERE order_id = ?", Integer.class, created.path("id").asLong());

        for (int attempt = 0; attempt < 2; attempt++) {
            JsonNode result = abandon(customer, requestId);
            assertThat(result.path("abandoned").asBoolean()).isFalse();
            assertThat(result.path("order").path("orderNo").asText()).isEqualTo(orderNo);
            assertThat(result.path("order").path("status").asText()).isEqualTo("PENDING_PAY");
        }
        assertThat(data(create(customer, requestId)).path("orderNo").asText()).isEqualTo(orderNo);
        assertThat(orderCount(customerId, requestId)).isEqualTo(1);
        assertThat(isAbandoned(customerId, requestId)).isFalse();
        assertThat(jdbc.queryForMap("SELECT * FROM orders WHERE order_no = ?", orderNo)).isEqualTo(order);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM order_status_log WHERE order_id = ?", Integer.class, created.path("id").asLong())).isEqualTo(logs);
        assertThat(stockSnapshot()).isEqualTo(stock);
        assertThat(financialSnapshot(customerId)).isEqualTo(finances);
    }

    @Test
    void legacyOrderWithoutLedgerIsStillRecoveredAndPaidOrderIsNeverRefunded() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        String orderNo = data(create(customer, requestId)).path("orderNo").asText();
        pay(customer, orderNo);
        jdbc.update("DELETE FROM checkout_request WHERE customer_id = ? AND client_request_id = ?", customerId, requestId);
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);
        Map<String, Object> order = jdbc.queryForMap("SELECT * FROM orders WHERE order_no = ?", orderNo);

        JsonNode result = abandon(customer, requestId);
        assertThat(result.path("abandoned").asBoolean()).isFalse();
        assertThat(result.path("order").path("orderNo").asText()).isEqualTo(orderNo);
        assertThat(getData(lookupUrl(requestId), customer).path("orderNo").asText()).isEqualTo(orderNo);
        assertThat(data(create(customer, requestId)).path("orderNo").asText()).isEqualTo(orderNo);
        assertThat(ledgerCount(customerId, requestId)).isEqualTo(1);
        assertThat(isAbandoned(customerId, requestId)).isFalse();
        assertThat(jdbc.queryForMap("SELECT * FROM orders WHERE order_no = ?", orderNo)).isEqualTo(order);
        assertThat(stockSnapshot()).isEqualTo(stock);
        assertThat(financialSnapshot(customerId)).isEqualTo(finances);
    }

    @Test
    void identicalRequestKeysAreIsolatedBetweenCustomersAndRequireAuthentication() throws Exception {
        String firstCustomer = memberToken();
        String secondCustomer = memberToken();
        long firstId = customerId(firstCustomer);
        long secondId = customerId(secondCustomer);
        String requestId = UUID.randomUUID().toString();
        mvc.perform(post(abandonUrl(requestId))).andExpect(status().isUnauthorized());
        mvc.perform(get(lookupUrl(requestId))).andExpect(status().isUnauthorized());
        mvc.perform(authed(post(abandonUrl(requestId)), staffToken())).andExpect(status().isForbidden());
        assertThat(ledgerCount(firstId, requestId)).isZero();

        assertThat(abandon(firstCustomer, requestId).path("abandoned").asBoolean()).isTrue();
        String secondOrder = data(create(secondCustomer, requestId)).path("orderNo").asText();
        assertThat(getData(lookupUrl(requestId), firstCustomer).isNull()).isTrue();
        assertThat(abandon(firstCustomer, requestId).path("order").isNull()).isTrue();
        assertThat(create(firstCustomer, requestId).getResponse().getStatus()).isEqualTo(409);
        assertThat(abandon(secondCustomer, requestId).path("order").path("orderNo").asText()).isEqualTo(secondOrder);
        assertThat(isAbandoned(firstId, requestId)).isTrue();
        assertThat(isAbandoned(secondId, requestId)).isFalse();
        assertThat(orderCount(firstId, requestId)).isZero();
        assertThat(orderCount(secondId, requestId)).isEqualTo(1);
    }

    @Test
    void failedCreateRollsBackLedgerOrderAndStockThenCanBeSafelyAbandoned() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);
        // 失败点已在请求行、库存与订单主表写入之后，验证它们没有拆成独立事务。
        doThrow(new IllegalStateException("injected order item failure")).when(orderItemMapper).insert(any(OrderItem.class));
        try {
            assertThat(create(customer, requestId).getResponse().getStatus()).isEqualTo(500);
        } finally {
            reset(orderItemMapper);
        }
        assertThat(ledgerCount(customerId, requestId)).isZero();
        assertThat(orderCount(customerId, requestId)).isZero();
        assertThat(stockSnapshot()).isEqualTo(stock);
        assertThat(financialSnapshot(customerId)).isEqualTo(finances);
        assertThat(abandon(customer, requestId).path("abandoned").asBoolean()).isTrue();
        assertThat(create(customer, requestId).getResponse().getStatus()).isEqualTo(409);
        assertThat(stockSnapshot()).isEqualTo(stock);
        assertThat(financialSnapshot(customerId)).isEqualTo(finances);
    }

    @Test
    void concurrentAbandonWaitsForCreateCommitAndReturnsTheOriginalOrder() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        long occupiedBefore = ((Number) stockSnapshot().get("stock_occupied")).longValue();
        Map<String, Object> finances = financialSnapshot(customerId);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        authenticate(customerId);
        try {
            Future<JsonNode> waiting = tx.execute(transaction -> {
                OrderDetail order = customerOrderService.create(request(requestId));
                assertThat(order.orderNo()).isNotBlank();
                Future<JsonNode> result = pool.submit(() -> abandon(customer, requestId));
                awaitRequestLock();
                assertThat(result.isDone()).isFalse();
                return result;
            });
            JsonNode result = waiting.get(30, TimeUnit.SECONDS);
            assertThat(result.path("abandoned").asBoolean()).isFalse();
            assertThat(result.path("order").path("status").asText()).isEqualTo("PENDING_PAY");
            assertThat(orderCount(customerId, requestId)).isEqualTo(1);
            assertThat(((Number) stockSnapshot().get("stock_occupied")).longValue()).isEqualTo(occupiedBefore + 1);
            assertThat(isAbandoned(customerId, requestId)).isFalse();
            assertThat(financialSnapshot(customerId)).isEqualTo(finances);
        } finally {
            SecurityContextHolder.clearContext();
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentCreateWaitsForAbandonCommitThenRejectsWithoutStockOrMoneyChanges() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        authenticate(customerId);
        try {
            Future<MvcResult> waiting = tx.execute(transaction -> {
                AbandonCheckoutResult abandoned = customerOrderService.abandonCheckout(requestId);
                assertThat(abandoned.abandoned()).isTrue();
                Future<MvcResult> result = pool.submit(() -> create(customer, requestId));
                awaitRequestLock();
                assertThat(result.isDone()).isFalse();
                return result;
            });
            assertThat(waiting.get(30, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(409);
            assertThat(orderCount(customerId, requestId)).isZero();
            assertThat(ledgerCount(customerId, requestId)).isEqualTo(1);
            assertThat(isAbandoned(customerId, requestId)).isTrue();
            assertThat(stockSnapshot()).isEqualTo(stock);
            assertThat(financialSnapshot(customerId)).isEqualTo(finances);
        } finally {
            SecurityContextHolder.clearContext();
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentAbandonWaitsForCreateRollbackThenPermanentlyFencesTheRequest() throws Exception {
        String customer = memberToken();
        long customerId = customerId(customer);
        String requestId = UUID.randomUUID().toString();
        Map<String, Object> stock = stockSnapshot();
        Map<String, Object> finances = financialSnapshot(customerId);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        authenticate(customerId);
        try {
            Future<JsonNode> waiting = tx.execute(transaction -> {
                customerOrderService.create(request(requestId));
                Future<JsonNode> result = pool.submit(() -> abandon(customer, requestId));
                awaitRequestLock();
                transaction.setRollbackOnly();
                return result;
            });
            JsonNode result = waiting.get(30, TimeUnit.SECONDS);
            assertThat(result.path("abandoned").asBoolean()).isTrue();
            assertThat(result.path("order").isNull()).isTrue();
            assertThat(orderCount(customerId, requestId)).isZero();
            assertThat(isAbandoned(customerId, requestId)).isTrue();
            assertThat(stockSnapshot()).isEqualTo(stock);
            assertThat(financialSnapshot(customerId)).isEqualTo(finances);
        } finally {
            SecurityContextHolder.clearContext();
            pool.shutdownNow();
        }
        assertThat(create(customer, requestId).getResponse().getStatus()).isEqualTo(409);
    }

    private CreateOrderRequest request(String requestId) {
        return new CreateOrderRequest(requestId, "dev-table-a1",
                List.of(new CreateOrderRequest.Item(1L, List.of(), List.of(), 1)), 1, "待确认原请求");
    }

    private MvcResult create(String customer, String requestId) throws Exception {
        return mvc.perform(authed(post("/api/v1/c/orders"), customer)
                .contentType(MediaType.APPLICATION_JSON).content(toJson(request(requestId)))).andReturn();
    }

    private JsonNode abandon(String customer, String requestId) throws Exception {
        return data(mvc.perform(authed(post(abandonUrl(requestId)), customer)).andExpect(status().isOk()).andReturn());
    }

    private static String lookupUrl(String requestId) {
        return "/api/v1/c/orders/by-request/" + requestId;
    }

    private static String abandonUrl(String requestId) {
        return lookupUrl(requestId) + "/abandon";
    }

    private long customerId(String customer) throws Exception {
        return getData("/api/v1/c/me", customer).path("id").asLong();
    }

    private int orderCount(long customerId, String requestId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE customer_id = ? AND client_request_id = ?", Integer.class, customerId, requestId);
    }

    private int ledgerCount(long customerId, String requestId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM checkout_request WHERE customer_id = ? AND client_request_id = ?", Integer.class, customerId, requestId);
    }

    private boolean isAbandoned(long customerId, String requestId) {
        return jdbc.queryForObject("SELECT abandoned FROM checkout_request WHERE customer_id = ? AND client_request_id = ?", Boolean.class, customerId, requestId);
    }

    private Map<String, Object> stockSnapshot() {
        return jdbc.queryForMap("SELECT daily_stock, stock_quantity, stock_occupied, stock_date FROM dish WHERE id = 1");
    }

    private Map<String, Object> financialSnapshot(long customerId) {
        return jdbc.queryForMap("""
                SELECT balance,
                    (SELECT COUNT(*) FROM wallet_transaction WHERE customer_id = c.id) AS wallet_entries,
                    (SELECT COUNT(*) FROM payment p JOIN orders o ON o.id = p.order_id WHERE o.customer_id = c.id) AS payments,
                    (SELECT COUNT(*) FROM refund r JOIN orders o ON o.id = r.order_id WHERE o.customer_id = c.id) AS refunds
                FROM customer c WHERE c.id = ?
                """, customerId);
    }

    private void authenticate(long customerId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(UserType.CUSTOMER, customerId, null, null), null, List.of()));
    }

    private void awaitRequestLock() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            // 本线程仍在外层业务事务里，清除 PG 统计快照才能看到刚开始等待的连接。
            jdbc.execute("SELECT pg_stat_clear_snapshot()");
            Integer waiting = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock' AND datname = current_database()
                      AND query LIKE '%checkout_request%'
                    """, Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            try {
                Thread.sleep(25);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError("并发请求没有等待 checkout_request 行锁");
    }
}
