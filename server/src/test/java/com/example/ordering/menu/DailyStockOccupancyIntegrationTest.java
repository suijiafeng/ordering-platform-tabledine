package com.example.ordering.menu;

import com.example.ordering.module.menu.service.DailyStockService;
import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DailyStockOccupancyIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private DailyStockService dailyStockService;

    @Test
    void loweringCapBelowOccupiedKeepsTheDeficitWhenRaisedOrCancelled() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long dishId = createDish(owner);
        setCap(owner, dishId, 10);
        String first = order(customer, dishId, 5);
        String second = order(customer, dishId, 3);
        assertStock(dishId, 2, 8);

        setCap(owner, dishId, 5);
        assertStock(dishId, 0, 8);
        setCap(owner, dishId, 10);
        assertStock(dishId, 2, 8);
        setCap(owner, dishId, 5);
        cancel(customer, second);
        assertStock(dishId, 0, 5);
        cancel(customer, first);
        assertStock(dishId, 5, 0);
        mvc.perform(authed(post("/api/v1/c/orders/" + first + "/cancel"), customer))
                .andExpect(status().isConflict());
        assertStock(dishId, 5, 0);
    }

    @Test
    void disablingAndReenablingKeepsOccupancyAndCountsUnlimitedOrders() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long dishId = createDish(owner);
        setCap(owner, dishId, 10);
        String limited = order(customer, dishId, 8);
        setCap(owner, dishId, null);
        assertStock(dishId, null, 8);
        String unlimited = order(customer, dishId, 4);
        assertStock(dishId, null, 12);
        cancel(customer, limited);
        assertStock(dishId, null, 4);
        setCap(owner, dishId, 5);
        assertStock(dishId, 1, 4);
        cancel(customer, unlimited);
        assertStock(dishId, 5, 0);
    }

    @Test
    void midnightResetsUnlimitedOccupancyAndOldCancellationsDoNotReleaseToday() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long dishId = createDish(owner);
        String yesterday = order(customer, dishId, 8);
        jdbc.update("UPDATE dish SET stock_date = stock_date - 1 WHERE id = ?", dishId);
        jdbc.update("UPDATE orders SET created_at = created_at - interval '1 day' WHERE order_no = ?", yesterday);
        dailyStockService.resetDaily();
        assertStock(dishId, null, 0);
        setCap(owner, dishId, 10);
        String today = order(customer, dishId, 3);
        assertStock(dishId, 7, 3);
        cancel(customer, yesterday);
        assertStock(dishId, 7, 3);
        dailyStockService.resetDaily();
        assertStock(dishId, 7, 3);
        cancel(customer, today);
        assertStock(dishId, 10, 0);
    }

    @Test
    void capEditResetsStaleOccupancyEvenAfterDailyCacheWasFilled() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long dishId = createDish(owner);
        setCap(owner, dishId, 10);
        order(customer, dishId, 8);
        dailyStockService.ensureFresh();
        jdbc.update("UPDATE dish SET stock_date = stock_date - 1 WHERE id = ?", dishId);
        setCap(owner, dishId, 5);
        assertStock(dishId, 5, 0);
    }

    @Test
    void concurrentCapRaiseAndCancellationKeepTheSameOccupiedCount() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long dishId = createDish(owner);
        setCap(owner, dishId, 10);
        order(customer, dishId, 5);
        String cancelled = order(customer, dishId, 3);
        setCap(owner, dishId, 5);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> capChange = executor.submit(() -> {
                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                setCap(owner, dishId, 10);
                return null;
            });
            Future<?> cancellation = executor.submit(() -> {
                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                cancel(customer, cancelled);
                return null;
            });
            start.countDown();
            capChange.get(10, TimeUnit.SECONDS);
            cancellation.get(10, TimeUnit.SECONDS);
            assertStock(dishId, 5, 5);
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void stockFailureRollsBackEarlierUnlimitedOccupancyInTheSameOrder() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        long unlimited = createDish(owner);
        long limited = createDish(owner);
        setCap(owner, limited, 1);
        Map<String, Object> first = Map.of("dishId", unlimited, "quantity", 3, "specItemIds", List.of(), "addonItemIds", List.of());
        Map<String, Object> second = Map.of("dishId", limited, "quantity", 2, "specItemIds", List.of(), "addonItemIds", List.of());
        mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(json("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1",
                                "items", List.of(first, second), "peopleCount", 1)))
                .andExpect(status().isConflict());
        assertStock(unlimited, null, 0);
        assertStock(limited, 1, 0);
    }

    private long createDish(String owner) throws Exception {
        return data(mvc.perform(authed(post("/api/v1/m/dishes"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("categoryId", 1, "name", "占用测试-" + UUID.randomUUID(), "price", 100,
                                "specGroups", List.of(), "addonGroups", List.of())))
                .andExpect(status().isOk()).andReturn()).path("dish").path("id").asLong();
    }

    private void setCap(String owner, long dishId, Integer cap) throws Exception {
        mvc.perform(authed(put("/api/v1/m/dishes/" + dishId + "/stock"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("stockQuantity", cap))).andExpect(status().isOk());
    }

    private String order(String customer, long dishId, int quantity) throws Exception {
        Map<String, Object> item = Map.of("dishId", dishId, "quantity", quantity, "specItemIds", List.of(), "addonItemIds", List.of());
        return data(mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(json("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1",
                                "items", List.of(item), "peopleCount", 1)))
                .andExpect(status().isOk()).andReturn()).path("orderNo").asText();
    }

    private void cancel(String customer, String orderNo) throws Exception {
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)).andExpect(status().isOk());
    }

    private void assertStock(long dishId, Integer remaining, long occupied) {
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM dish WHERE id = ?", Integer.class, dishId)).isEqualTo(remaining);
        assertThat(jdbc.queryForObject("SELECT stock_occupied FROM dish WHERE id = ?", Long.class, dishId)).isEqualTo(occupied);
    }
}
