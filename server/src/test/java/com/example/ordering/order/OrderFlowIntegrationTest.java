package com.example.ordering.order;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 订单 → 余额支付 → 履约 → 退款 全链路。种子数据：奶茶(3) 1200 分，大杯 +300，珍珠 +200，椰果 +200；红烧肉(1) 3800。
 */
class OrderFlowIntegrationTest extends AbstractIntegrationTest {

    @org.springframework.beans.factory.annotation.Autowired
    com.example.ordering.module.menu.service.DailyStockService dailyStockService;

    // ==================== 下单 ====================

    @Test
    void serverRecalculatesPriceAndIdempotentByClientRequestId() throws Exception {
        String customer = memberToken();
        String reqId = UUID.randomUUID().toString();
        Map<String, Object> body = orderBody(reqId, List.of(
                item(3, List.of(2L), List.of(1L, 2L), 2),   // (1200 + 300 + 200 + 200) × 2 = 3800
                item(1, List.of(), List.of(), 1)));          // 3800
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_PAY"))
                .andExpect(jsonPath("$.data.totalAmount").value(7600))
                .andExpect(jsonPath("$.data.payAmount").value(7600))
                .andExpect(jsonPath("$.data.tableCode").value("A1"))
                .andExpect(jsonPath("$.data.items[0].unitPrice").value(1900))
                .andExpect(jsonPath("$.data.items[0].specDesc").value("大杯"))
                .andExpect(jsonPath("$.data.items[0].addonDesc").value("珍珠, 椰果"))
                .andExpect(jsonPath("$.data.canCancel").value(true))
                .andReturn();
        String orderNo = data(r).path("orderNo").asText();

        // 同一 clientRequestId 重试：返回同一笔订单
        mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNo").value(orderNo));
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE client_request_id = ?", Integer.class, reqId);
        assertThat(count).isEqualTo(1);

        // 他人看不到这笔订单
        String other = memberToken();
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), other)).andExpect(status().isNotFound());
    }

    @Test
    void validationRejectsBadSelections() throws Exception {
        String customer = memberToken();
        // 必选规格未选
        mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(orderBody(UUID.randomUUID().toString(), List.of(item(3, List.of(), List.of(), 1))))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));
        // 加料超上限（最多 2）
        mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(orderBody(UUID.randomUUID().toString(), List.of(item(3, List.of(1L), List.of(1L, 2L, 3L), 1))))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));
        // 桌码无效
        Map<String, Object> bad = orderBody(UUID.randomUUID().toString(), List.of(item(1, List.of(), List.of(), 1)));
        bad.put("qrToken", "no-such-token");
        mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON).content(toJson(bad)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40402));
        // 店铺打烊
        String owner = ownerToken();
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/m/store/business-status"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("open", false))).andExpect(status().isOk());
        try {
            mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                            .content(toJson(orderBody(UUID.randomUUID().toString(), List.of(item(1, List.of(), List.of(), 1))))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(60002));
        } finally {
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/m/store/business-status"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content(json("open", true))).andExpect(status().isOk());
        }
    }

    @Test
    void stockIsDeductedAndRestoredOnCancel() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        // 番茄炒蛋(2) 限量 2 份
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 2))).andExpect(status().isOk());
        try {
            // 超量下单被拒
            mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                            .content(toJson(orderBody(UUID.randomUUID().toString(), List.of(item(2, List.of(), List.of(), 3))))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(60001));
            // 下 2 份 → 库存 0
            String orderNo = createOrder(customer, List.of(item(2, List.of(), List.of(), 2)));
            assertThat(stock(2)).isEqualTo(0);
            // 取消待支付订单 → 回补
            mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("CLOSED"));
            assertThat(stock(2)).isEqualTo(2);
        } finally {
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":null}")).andExpect(status().isOk());
        }
    }

    @Test
    void dishInDisabledCategoryCannotBeOrdered() throws Exception {
        String customer = memberToken();
        jdbc.update("UPDATE category SET status = 0 WHERE id = 1");  // 招牌热菜（红烧肉、番茄炒蛋）
        try {
            mvc.perform(authed(post("/api/v1/c/orders"), customer).contentType(MediaType.APPLICATION_JSON)
                            .content(toJson(orderBody(UUID.randomUUID().toString(), List.of(item(1, List.of(), List.of(), 1))))))
                    .andExpect(status().isConflict());
        } finally {
            jdbc.update("UPDATE category SET status = 1 WHERE id = 1");
        }
    }

    @Test
    void dailyStockResetsAtMidnightAndRestoreNeverExceedsLimit() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 3))).andExpect(status().isOk());
        try {
            String orderNo = createOrder(customer, List.of(item(2, List.of(), List.of(), 2)));
            assertThat(stock(2)).isEqualTo(1);
            // 中午把限量 3 改成 5：已占用 2 份，今日剩余应为 3 而不是 5
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 5))).andExpect(status().isOk());
            assertThat(stock(2)).isEqualTo(3);
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 3))).andExpect(status().isOk());
            assertThat(stock(2)).isEqualTo(1);
            // 模拟跨天：业务日期回到昨天 → 幂等重置补做，今日剩余回到每日限量
            jdbc.update("UPDATE dish SET stock_date = stock_date - 1 WHERE id = 2");
            dailyStockService.resetDaily();
            assertThat(stock(2)).isEqualTo(3);
            // 再次调用不会重复重置：今天卖 1 份后仍是 2
            String todayOrder = createOrder(customer, List.of(item(2, List.of(), List.of(), 1)));
            assertThat(stock(2)).isEqualTo(2);
            dailyStockService.resetDaily();
            assertThat(stock(2)).isEqualTo(2);
            // 昨天的订单今天取消：占用的是昨天的限量，不回补今天的剩余
            jdbc.update("UPDATE orders SET created_at = created_at - interval '1 day' WHERE order_no = ?", orderNo);
            mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)).andExpect(status().isOk());
            assertThat(stock(2)).isEqualTo(2);
            // 今天的订单取消：回补
            mvc.perform(authed(post("/api/v1/c/orders/" + todayOrder + "/cancel"), customer)).andExpect(status().isOk());
            assertThat(stock(2)).isEqualTo(3);
        } finally {
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":null}")).andExpect(status().isOk());
        }
    }

    @Test
    void customerOrderDetailHidesStaffIdentity() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staffToken())).andExpect(status().isOk());
        JsonNode logs = getData("/api/v1/c/orders/" + orderNo, customer).path("logs");
        for (JsonNode l : logs) {
            assertThat(l.path("operatorName").isNull()).isTrue();
            assertThat(l.path("operatorId").isNull()).isTrue();
        }
        assertThat(getData("/api/v1/m/orders/" + orderNo, ownerToken()).path("logs").findValuesAsText("operatorName")).contains("店员小王");
    }

    // ==================== 支付 + 履约 ====================

    @Test
    void payThenFulfilThroughMerchantEndpoints() throws Exception {
        String customer = memberToken();
        String owner = ownerToken();
        String staff = staffToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));

        // 余额支付：发起即扣费入账
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(3800))
                .andExpect(jsonPath("$.data.channel").value("H5"))
                .andExpect(jsonPath("$.data.params.paid").value(true));
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), customer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PAID"))
                .andExpect(jsonPath("$.data.payment.status").value("SUCCESS"));
        // 重复支付被拒，不会二次扣费
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer)).andExpect(status().isConflict());

        // 商家端：列表能看到 / 轮询计数
        mvc.perform(authed(get("/api/v1/m/orders?status=PAID"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.list[?(@.orderNo=='" + orderNo + "')]").exists());
        mvc.perform(authed(get("/api/v1/m/orders/new-count?since=2000-01-01T00:00:00Z"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pendingAcceptCount").isNumber())
                .andExpect(jsonPath("$.data.readyCount").isNumber());
        // 权责分离：未经前厅确认的订单不进后厨队列，后厨也不能自己接单
        String kitchen = kitchenToken();
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), kitchen))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "')]").doesNotExist());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), kitchen)).andExpect(status().isForbidden());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/reject"), kitchen)).andExpect(status().isForbidden());

        // 前厅接单 → 进入后厨队列 → 后厨出餐 → 前厅送达
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("MAKING"));
        // 重复接单：状态冲突
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(40901));
        // 进入后厨「待制作」：制作中且尚未开始
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), kitchen))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "' && @.status=='MAKING' && @.cookingStartedAt == null)]").exists());
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), kitchen))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.makingOrderNos[?(@=='" + orderNo + "')]").exists());
        // 开始制作：待制作 → 制作中（订单状态不变）；重复点击冲突
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), kitchen))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("MAKING"));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), kitchen))
                .andExpect(status().isConflict());
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), kitchen))
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "' && @.cookingStartedAt != null)]").exists());
        // 制作完成：进入后厨看板「待取餐」栏，等前厅取餐送达
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/ready"), kitchen))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), kitchen))
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "' && @.status=='READY')]").exists());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/deliver"), kitchen)).andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/v1/m/members"), kitchen)).andExpect(status().isForbidden());
        // 后厨可以查看订单与菜品，但不能编辑（沽清也由前厅 / 店主操作）
        mvc.perform(authed(get("/api/v1/m/orders"), kitchen)).andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/m/orders/" + orderNo), kitchen)).andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/m/dishes"), kitchen)).andExpect(status().isOk());
        mvc.perform(authed(patch("/api/v1/m/dishes/1/sold-out"), kitchen)
                .contentType(MediaType.APPLICATION_JSON).content(json("soldOut", true))).andExpect(status().isForbidden());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/deliver"), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("DONE"));
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), kitchen))
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "')]").doesNotExist());

        // 顾客端看到状态与日志（操作人类型可见，员工身份不对顾客暴露；商家端可见操作人）
        JsonNode detail = getData("/api/v1/c/orders/" + orderNo, customer);
        assertThat(detail.path("status").asText()).isEqualTo("DONE");
        assertThat(detail.path("logs").size()).isGreaterThanOrEqualTo(5);
        assertThat(detail.path("logs").get(2).path("operatorType").asText()).isEqualTo("MERCHANT");
        assertThat(detail.path("logs").get(2).path("operatorName").isNull()).isTrue();
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("logs").get(2).path("operatorName").asText()).isEqualTo("店员小王");
        assertThat(detail.path("canApplyRefund").asBoolean()).isTrue();

        // 整单取消只有店主可以，且已完成订单不能取消
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel"), staff)
                .contentType(MediaType.APPLICATION_JSON).content(json("reason", "x"))).andExpect(status().isForbidden());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("reason", "x"))).andExpect(status().isConflict());
    }

    @Test
    void autoAcceptMovesPaidOrderToMaking() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        setAutoAccept(owner, true);
        try {
            String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
            pay(customer, orderNo);
            mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), customer))
                    .andExpect(jsonPath("$.data.status").value("MAKING"))
                    .andExpect(jsonPath("$.data.paidAt").isNotEmpty())
                    .andExpect(jsonPath("$.data.acceptedAt").isNotEmpty());
        } finally {
            setAutoAccept(owner, false);
        }
    }

    // ==================== 前厅代客下单 + 线下收款 ====================

    @Test
    void frontDeskPlacesOrderWithOfflinePayment() throws Exception {
        String staff = staffToken();
        String owner = ownerToken();
        Long tableId = jdbc.queryForObject("SELECT id FROM dining_table WHERE status = 1 ORDER BY id LIMIT 1", Long.class);
        String requestId = java.util.UUID.randomUUID().toString();
        String body = toJson(Map.of("clientRequestId", requestId, "tableId", tableId, "peopleCount", 2, "payMethod", "CASH",
                "items", List.of(item(1, List.of(), List.of(), 2))));

        // 后厨不能代客下单
        mvc.perform(authed(post("/api/v1/m/orders"), kitchenToken()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        // 前厅下单：线下收款，直接进入待制作
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders"), staff).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("MAKING"))
                .andExpect(jsonPath("$.data.source").value("MERCHANT"))
                .andExpect(jsonPath("$.data.payment.channel").value("OFFLINE"))
                .andExpect(jsonPath("$.data.payment.payMethod").value("CASH"))
                .andExpect(jsonPath("$.data.cookingStartedAt").value(org.hamcrest.Matchers.nullValue()))
                .andReturn();
        String orderNo = data(r).path("orderNo").asText();
        // 重复提交同一请求号：返回同一笔订单，不重复下单
        mvc.perform(authed(post("/api/v1/m/orders"), staff).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(jsonPath("$.data.orderNo").value(orderNo));
        // 进入后厨「待制作」
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), staff))
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "')]").exists());
        // 顾客查看这笔没有顾客账号的订单：404，而不是 500
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), memberToken())).andExpect(status().isNotFound());
        // 按收款方式统计
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        mvc.perform(authed(get("/api/v1/m/reports/summary?from=" + today + "&to=" + today), owner))
                .andExpect(jsonPath("$.data.byPayMethod[?(@.method=='CASH')]").exists());
        // 店主整单取消：线下收款的订单直接记为线下退款（需当面退还）
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "顾客临时有事")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"));
        JsonNode detail = getData("/api/v1/m/orders/" + orderNo, owner);
        assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("OFFLINE");
    }

    @Test
    void frontDeskPayLaterOrderIsSettledOnLeave() throws Exception {
        String staff = staffToken();
        String owner = ownerToken();
        Long tableId = jdbc.queryForObject("SELECT id FROM dining_table WHERE status = 1 ORDER BY id LIMIT 1", Long.class);
        java.util.function.Function<String, String> body = rid -> {
            try {
                return toJson(Map.of("clientRequestId", rid, "tableId", tableId, "peopleCount", 1, "payMode", "PAY_LATER",
                        "items", List.of(item(1, List.of(), List.of(), 1))));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        };

        // 先吃后付：不收款直接进后厨，未结账不计入实收
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders"), staff).contentType(MediaType.APPLICATION_JSON)
                        .content(body.apply(java.util.UUID.randomUUID().toString())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("MAKING"))
                .andExpect(jsonPath("$.data.payMode").value("PAY_LATER"))
                .andExpect(jsonPath("$.data.paidAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.payment").value(org.hamcrest.Matchers.nullValue()))
                .andReturn();
        String orderNo = data(r).path("orderNo").asText();
        mvc.perform(authed(get("/api/v1/m/orders?unsettled=true"), staff))
                .andExpect(jsonPath("$.data.list[?(@.orderNo=='" + orderNo + "')]").exists());
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), staff))
                .andExpect(jsonPath("$.data.unsettledCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        // 还没结账不能退款；结账必须选收款方式
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("type", "FULL", "reason", "x"))).andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/settle"), staff).contentType(MediaType.APPLICATION_JSON)
                .content(json("payRemark", "x"))).andExpect(status().is4xxClientError());
        // 后厨不能结账
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/settle"), kitchenToken()).contentType(MediaType.APPLICATION_JSON)
                .content(json("payMethod", "CASH"))).andExpect(status().isForbidden());
        // 结账：登记现金收款，订单此刻入账；只能结一次
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/settle"), staff).contentType(MediaType.APPLICATION_JSON)
                        .content(json("payMethod", "CASH")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.paidAt").isNotEmpty())
                .andExpect(jsonPath("$.data.payment.channel").value("OFFLINE"))
                .andExpect(jsonPath("$.data.payment.payMethod").value("CASH"));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/settle"), staff).contentType(MediaType.APPLICATION_JSON)
                .content(json("payMethod", "CASH"))).andExpect(status().isConflict());
        mvc.perform(authed(get("/api/v1/m/orders?unsettled=true"), staff))
                .andExpect(jsonPath("$.data.list[?(@.orderNo=='" + orderNo + "')]").doesNotExist());

        // 没结账就整单取消：直接取消，不产生退款
        MvcResult r2 = mvc.perform(authed(post("/api/v1/m/orders"), staff).contentType(MediaType.APPLICATION_JSON)
                .content(body.apply(java.util.UUID.randomUUID().toString()))).andExpect(status().isOk()).andReturn();
        String second = data(r2).path("orderNo").asText();
        mvc.perform(authed(post("/api/v1/m/orders/" + second + "/cancel"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "顾客没吃就走了")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"));
        assertThat(getData("/api/v1/m/orders/" + second, owner).path("refunds").size()).isZero();
    }

    @org.springframework.beans.factory.annotation.Autowired
    com.example.ordering.module.order.service.MerchantPlaceOrderService placeOrderService;
    @org.springframework.beans.factory.annotation.Autowired
    org.springframework.transaction.PlatformTransactionManager txManager;

    /**
     * 结账与整单取消并发：结账事务已改写订单但未提交时店主点取消，取消必须等结账提交后按「已收款」处理并退款，
     * 不能按开始时读到的「未结账」直接取消（钱收了却没有退款单）。
     */
    @Test
    void cancelRacingWithSettleStillRefunds() throws Exception {
        String staff = staffToken();
        String owner = ownerToken();
        Long tableId = jdbc.queryForObject("SELECT id FROM dining_table WHERE status = 1 ORDER BY id LIMIT 1", Long.class);
        String orderNo = data(mvc.perform(authed(post("/api/v1/m/orders"), staff).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("clientRequestId", UUID.randomUUID().toString(), "tableId", tableId, "peopleCount", 1,
                                "payMode", "PAY_LATER", "items", List.of(item(1, List.of(), List.of(), 1))))))
                .andExpect(status().isOk()).andReturn()).path("orderNo").asText();
        Map<String, Object> staffRow = jdbc.queryForMap("SELECT id, store_id FROM staff WHERE username = 'staff'");
        Long staffId = ((Number) staffRow.get("id")).longValue();
        Long storeId = ((Number) staffRow.get("store_id")).longValue();

        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        java.util.concurrent.Future<MvcResult> cancel;
        var auth = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                new com.example.ordering.security.LoginUser(com.example.ordering.security.UserType.STAFF, staffId, storeId, "STAFF"),
                null, List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_STAFF")));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);
        com.example.ordering.tenant.StoreContext.set(storeId);
        try {
            cancel = new org.springframework.transaction.support.TransactionTemplate(txManager).execute(st -> {
                // 结账已写入 paid_at 与线下收款单，事务还没提交（持有订单行锁）
                placeOrderService.settle(orderNo, new com.example.ordering.module.order.dto.SettleRequest("CASH", null));
                java.util.concurrent.Future<MvcResult> f = pool.submit(() -> mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "并发取消"))).andReturn());
                awaitBlockedOnLock();
                return f;
            });
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
            com.example.ordering.tenant.StoreContext.clear();
        }
        MvcResult result = cancel.get(30, java.util.concurrent.TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode detail = getData("/api/v1/m/orders/" + orderNo, owner);
        assertThat(detail.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(detail.path("paidAt").isNull()).isFalse();
        assertThat(detail.path("refunds").size()).isEqualTo(1);
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("OFFLINE");
    }

    /** 等到另一个连接在等行锁（取消请求被结账事务挡住） */
    private void awaitBlockedOnLock() {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            Integer waiting = jdbc.queryForObject(
                    "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()", Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError("取消请求没有等待订单行锁");
    }

    // ==================== 接单后申请取消 ====================

    @Test
    void customerCancelAfterAcceptNeedsMerchantConfirmation() throws Exception {
        String customer = memberToken();
        String staff = staffToken();
        String kitchen = kitchenToken();

        // 接单后不能直接取消，只能申请取消
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff)).andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), customer))
                .andExpect(jsonPath("$.data.canCancel").value(false))
                .andExpect(jsonPath("$.data.canRequestCancel").value(true))
                .andExpect(jsonPath("$.data.canApplyRefund").value(false))
                .andExpect(jsonPath("$.data.cookingStartedAt").value(org.hamcrest.Matchers.nullValue()));
        // 后厨开工前不能申请退款，只能申请取消
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                .contentType(MediaType.APPLICATION_JSON).content(json("reason", "不想要了"))).andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)).andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel-request"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "等太久了")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cancelRequest.status").value("APPLYING"))
                .andExpect(jsonPath("$.data.canRequestCancel").value(false));
        // 申请处理期间：后厨不能开始制作，后厨也不能替前厅处理申请
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), kitchen)).andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel-request/approve"), kitchen)).andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), staff))
                .andExpect(jsonPath("$.data.cancelRequestCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        mvc.perform(authed(get("/api/v1/m/orders?cancelRequest=APPLYING"), staff))
                .andExpect(jsonPath("$.data.list[?(@.orderNo=='" + orderNo + "')]").exists());
        // 拒绝必须填理由；拒绝后订单继续制作，顾客看到理由，不能再次申请
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel-request/reject"), staff)
                .contentType(MediaType.APPLICATION_JSON).content(json("reason", ""))).andExpect(status().is4xxClientError());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/cancel-request/reject"), staff)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "菜已下锅")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("MAKING"))
                .andExpect(jsonPath("$.data.cancelRequest.status").value("REJECTED"));
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), customer))
                .andExpect(jsonPath("$.data.cancelRequest.rejectReason").value("菜已下锅"))
                .andExpect(jsonPath("$.data.canRequestCancel").value(false));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), kitchen)).andExpect(status().isOk());

        // 同意：订单取消并全额退款；后厨开始制作后不能再申请
        String second = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, second);
        mvc.perform(authed(post("/api/v1/m/orders/" + second + "/accept"), staff)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/c/orders/" + second + "/cancel-request"), customer)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/m/orders/" + second + "/cancel-request/approve"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.cancelRequest.status").value("APPROVED"));
        mvc.perform(authed(post("/api/v1/m/orders/" + second + "/cancel-request/approve"), staff)).andExpect(status().isConflict());
        mvc.perform(authed(get("/api/v1/c/orders/" + second), customer))
                .andExpect(jsonPath("$.data.refundStatus").value("FULL"));

        String third = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, third);
        mvc.perform(authed(post("/api/v1/m/orders/" + third + "/accept"), staff)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/m/orders/" + third + "/start"), kitchen)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/c/orders/" + third + "/cancel-request"), customer)).andExpect(status().isConflict());
    }

    // ==================== 退款 ====================

    @Test
    void customerCancelPaidOrderRefundsAutomatically() throws Exception {
        String customer = memberToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 2)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "点错了")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
        // 余额返还立即成功：退款单 SUCCESS，订单 refund_status=FULL
        JsonNode detail = getData("/api/v1/c/orders/" + orderNo, customer);
        assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
        assertThat(detail.path("refundedAmount").asLong()).isEqualTo(7600);
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("SUCCESS");
        assertThat(detail.path("refunds").get(0).path("initiator").asText()).isEqualTo("CUSTOMER");
    }

    @Test
    void merchantRejectRefundsAndRestoresStock() throws Exception {
        String owner = ownerToken();
        String staff = staffToken();
        String customer = memberToken();
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 5))).andExpect(status().isOk());
        try {
            String orderNo = createOrder(customer, List.of(item(2, List.of(), List.of(), 2)));
            pay(customer, orderNo);
            assertThat(stock(2)).isEqualTo(3);
            mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/reject"), staff)
                            .contentType(MediaType.APPLICATION_JSON).content(json("reason", "忙不过来")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                    .andExpect(jsonPath("$.data.cancelReason").value("商家拒单：忙不过来"));
            assertThat(stock(2)).isEqualTo(5);
            JsonNode detail = getData("/api/v1/m/orders/" + orderNo, staff);
            assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
            assertThat(detail.path("refunds").get(0).path("operatorName").asText()).isEqualTo("店员小王");
        } finally {
            mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":null}")).andExpect(status().isOk());
        }
    }

    @Test
    void itemRefundApplyApproveFlowAndGuards() throws Exception {
        String owner = ownerToken();
        String staff = staffToken();
        String customer = memberToken();
        // 奶茶中杯 ×2 (2400) + 红烧肉 ×1 (3800) = 6200
        String orderNo = createOrder(customer, List.of(item(3, List.of(1L), List.of(), 2), item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff)).andExpect(status().isOk());
        // 后厨开工后顾客才能申请退款（开工前应申请取消）
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), staff)).andExpect(status().isOk());

        JsonNode items = getData("/api/v1/c/orders/" + orderNo, customer).path("items");
        long milkTeaItemId = items.get(0).path("id").asLong();

        // 顾客申请退 1 杯奶茶
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("reason", "太甜了", "items", List.of(Map.of("orderItemId", milkTeaItemId, "quantity", 1))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPLYING"))
                .andExpect(jsonPath("$.data.type").value("ITEM"))
                .andExpect(jsonPath("$.data.amount").value(1200))
                .andReturn();
        String refundNo = data(r).path("refundNo").asText();

        // 已有退款处理中：再次申请 40902；顾客取消已接单订单 40901
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "再退")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(40902));
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(40901));

        // 店员不能审核
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/approve"), staff)).andExpect(status().isForbidden());
        // 拒绝必须填理由
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/reject"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "")))
                .andExpect(status().isUnprocessableEntity());
        // 退款列表（待审核）
        mvc.perform(authed(get("/api/v1/m/refunds?status=APPLYING"), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.list[?(@.refundNo=='" + refundNo + "')]").exists());

        // 店主同意 → Mock 立即成功 → 部分退款，订单状态不变
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/approve"), owner))
                .andExpect(status().isOk());
        JsonNode detail = getData("/api/v1/m/orders/" + orderNo, owner);
        assertThat(detail.path("status").asText()).isEqualTo("MAKING");
        assertThat(detail.path("refundStatus").asText()).isEqualTo("PARTIAL");
        assertThat(detail.path("refundedAmount").asLong()).isEqualTo(1200);
        assertThat(detail.path("refundableAmount").asLong()).isEqualTo(5000);
        assertThat(detail.path("items").get(0).path("refundedQty").asInt()).isEqualTo(1);
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("SUCCESS");
        assertThat(detail.path("refunds").get(0).path("items").get(0).path("dishName").asText()).isEqualTo("珍珠奶茶");

        // 自定义金额：店员 40301；超可退余额 42202；店主 4999 分成功
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), staff)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "CUSTOM", "reason", "补偿", "amount", 100))))
                .andExpect(status().isForbidden());
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "CUSTOM", "reason", "补偿", "amount", 5001))))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value(42202));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "CUSTOM", "reason", "补偿", "amount", 4999))))
                // 响应在事务内构建，返还余额在提交后：先返回 PROCESSING，随即成功
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PROCESSING"));
        assertThat(getData("/api/v1/m/orders/" + orderNo, owner).path("refundableAmount").asLong()).isEqualTo(1);
        // 再退 2 分（超 1 分余额）
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "CUSTOM", "reason", "补偿", "amount", 2))))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value(42202));
    }

    @Test
    void failedRefundCanBeRetriedOrSettledOffline() throws Exception {
        String owner = ownerToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        // 返还余额两次都确定失败（首次提交与重试）
        org.mockito.Mockito.doReturn(com.example.ordering.module.pay.channel.RefundResult.failed("余额返还失败（测试）"))
                .when(balanceChannel).refund(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyLong());
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "退款测试"))))
                .andExpect(status().isOk())
                .andReturn();
        String refundNo = data(r).path("refundNo").asText();
        mvc.perform(authed(get("/api/v1/m/refunds/" + refundNo), owner))
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.failReason").isNotEmpty());
        // 失败期间不能再发起新退款
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("type", "FULL", "reason", "again"))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(40902));
        // 重试仍失败（原因未变）→ 登记线下退款 → 计入已退
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/retry"), owner)).andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/m/refunds/" + refundNo), owner)).andExpect(jsonPath("$.data.status").value("FAILED"));
        mvc.perform(authed(post("/api/v1/m/refunds/" + refundNo + "/offline"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("remark", "现金退还")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OFFLINE"));
        JsonNode detail = getData("/api/v1/m/orders/" + orderNo, owner);
        assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
        assertThat(detail.path("refundedAmount").asLong()).isEqualTo(3800);
        assertThat(detail.path("status").asText()).isEqualTo("MAKING");  // 部分 / 售后退款不改变履约状态
    }

    @Test
    void customerCanWithdrawApplication() throws Exception {
        String staff = staffToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff)).andExpect(status().isOk());
        // 后厨开工后顾客才能申请退款（开工前应申请取消）
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/start"), staff)).andExpect(status().isOk());
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "不想要了")))
                .andExpect(status().isOk()).andReturn();
        String refundNo = data(r).path("refundNo").asText();
        mvc.perform(authed(post("/api/v1/c/refunds/" + refundNo + "/withdraw"), customer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("WITHDRAWN"));
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo + "/refunds"), customer))
                .andExpect(jsonPath("$.data[0].status").value("WITHDRAWN"));
        // 撤回后可再次申请
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/refunds"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "再次申请")))
                .andExpect(status().isOk());
    }

    // ==================== 看板 / 导出 ====================

    @Test
    void dashboardAndExport() throws Exception {
        String owner = ownerToken();
        String staff = staffToken();
        String customer = memberToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        pay(customer, orderNo);

        // 需求 §4：数据看板仅店主
        mvc.perform(authed(get("/api/v1/m/dashboard/today"), staff)).andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/v1/m/dashboard/today"), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.paidAmount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(3800)))
                .andExpect(jsonPath("$.data.topDishes[0].dishName").isNotEmpty())
                .andExpect(jsonPath("$.data.daily.length()").value(7));

        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        String weekAgo = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).minusDays(6).toString();

        // 区间统计：仅店主；每一天都有数据点（无订单的日期为 0）；今日那一点与今日看板口径一致
        mvc.perform(authed(get("/api/v1/m/reports/summary?from=" + weekAgo + "&to=" + today), staff)).andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/v1/m/reports/summary?from=" + weekAgo + "&to=" + today), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.from").value(weekAgo))
                .andExpect(jsonPath("$.data.to").value(today))
                .andExpect(jsonPath("$.data.orderCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.paidAmount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(3800)))
                .andExpect(jsonPath("$.data.daily.length()").value(7))
                .andExpect(jsonPath("$.data.daily[6].date").value(today))
                .andExpect(jsonPath("$.data.daily[6].orderCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.topDishes[0].dishName").isNotEmpty());
        // 参数校验：开始晚于结束、超过 92 天 → 42201
        mvc.perform(authed(get("/api/v1/m/reports/summary?from=" + today + "&to=" + weekAgo), owner))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));
        String tooEarly = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).minusDays(92).toString();
        mvc.perform(authed(get("/api/v1/m/reports/summary?from=" + tooEarly + "&to=" + today), owner))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));

        mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), staff))
                .andExpect(status().isForbidden());
        MvcResult r = mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), owner))
                .andExpect(status().isOk())
                .andReturn();
        String csv = r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿记录类型,订单号");
        assertThat(csv).contains(orderNo).contains("38.00").contains("余额");
    }

    // ==================== 工具 ====================

    private String createOrder(String customer, List<Map<String, Object>> items) throws Exception {
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(orderBody(UUID.randomUUID().toString(), items))))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("orderNo").asText();
    }


    private void setAutoAccept(String owner, boolean on) throws Exception {
        JsonNode store = getData("/api/v1/m/store", owner);
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("name", store.path("name").asText());
        body.put("phone", store.path("phone").asText(null));
        body.put("address", store.path("address").asText(null));
        body.put("businessHours", store.path("businessHours").asText(null));
        body.put("logo", store.path("logo").asText(null));
        body.put("autoAccept", on);
        body.put("payTimeoutMin", store.path("payTimeoutMin").asInt(15));
        body.put("acceptTimeoutMin", store.path("acceptTimeoutMin").asInt(10));
        body.put("afterSaleHours", store.path("afterSaleHours").asInt(24));
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/store"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body))).andExpect(status().isOk());
    }

    private Integer stock(long dishId) {
        return jdbc.queryForObject("SELECT stock_quantity FROM dish WHERE id = ?", Integer.class, dishId);
    }

    private static Map<String, Object> orderBody(String reqId, List<Map<String, Object>> items) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("clientRequestId", reqId);
        body.put("qrToken", "dev-table-a1");
        body.put("items", items);
        body.put("peopleCount", 2);
        body.put("remark", "少辣");
        return body;
    }

    private static Map<String, Object> item(long dishId, List<Long> specs, List<Long> addons, int qty) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("dishId", dishId);
        m.put("specItemIds", specs);
        m.put("addonItemIds", addons);
        m.put("quantity", qty);
        return m;
    }
}
