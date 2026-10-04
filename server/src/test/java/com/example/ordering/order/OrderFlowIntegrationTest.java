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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 订单 → 支付（Mock）→ 履约 → 退款 全链路。种子数据：奶茶(3) 1200 分，大杯 +300，珍珠 +200，椰果 +200；红烧肉(1) 3800。
 */
class OrderFlowIntegrationTest extends AbstractIntegrationTest {

    // ==================== 下单 ====================

    @Test
    void serverRecalculatesPriceAndIdempotentByClientRequestId() throws Exception {
        String customer = customerToken("WECHAT", "mock:price-" + UUID.randomUUID());
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
        String other = customerToken("ALIPAY", "mock:other-" + UUID.randomUUID());
        mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), other)).andExpect(status().isNotFound());
    }

    @Test
    void validationRejectsBadSelections() throws Exception {
        String customer = customerToken("WECHAT", "mock:valid-" + UUID.randomUUID());
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
        String customer = customerToken("WECHAT", "mock:stock-" + UUID.randomUUID());
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

    // ==================== 支付 + 履约 ====================

    @Test
    void payThenFulfilThroughMerchantEndpoints() throws Exception {
        String customer = customerToken("WECHAT", "mock:flow-" + UUID.randomUUID());
        String owner = ownerToken();
        String staff = staffToken();
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));

        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mock").value(true))
                .andExpect(jsonPath("$.data.amount").value(3800))
                .andExpect(jsonPath("$.data.channel").value("WECHAT"));
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/mock-pay"), customer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PAID"))
                .andExpect(jsonPath("$.data.payment.status").value("SUCCESS"));
        // 重复入账幂等
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/mock-pay"), customer)).andExpect(status().isConflict());

        // 商家端：列表能看到 / 轮询计数
        mvc.perform(authed(get("/api/v1/m/orders?status=PAID"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.list[?(@.orderNo=='" + orderNo + "')]").exists());
        mvc.perform(authed(get("/api/v1/m/orders/new-count?since=2000-01-01T00:00:00Z"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pendingAcceptCount").isNumber());
        mvc.perform(authed(get("/api/v1/m/orders/kitchen"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.orderNo=='" + orderNo + "')]").exists());

        // 接单 → 出餐 → 送达（店员可操作）
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("MAKING"));
        // 重复接单：状态冲突
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(40901));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/ready"), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/deliver"), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("DONE"));

        // 顾客端看到状态与日志（含操作人）
        JsonNode detail = getData("/api/v1/c/orders/" + orderNo, customer);
        assertThat(detail.path("status").asText()).isEqualTo("DONE");
        assertThat(detail.path("logs").size()).isGreaterThanOrEqualTo(5);
        assertThat(detail.path("logs").get(2).path("operatorName").asText()).isEqualTo("店员小王");
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
        String customer = customerToken("ALIPAY", "mock:auto-" + UUID.randomUUID());
        setAutoAccept(owner, true);
        try {
            String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
            payMock(customer, orderNo);
            mvc.perform(authed(get("/api/v1/c/orders/" + orderNo), customer))
                    .andExpect(jsonPath("$.data.status").value("MAKING"))
                    .andExpect(jsonPath("$.data.paidAt").isNotEmpty())
                    .andExpect(jsonPath("$.data.acceptedAt").isNotEmpty());
        } finally {
            setAutoAccept(owner, false);
        }
    }

    // ==================== 退款 ====================

    @Test
    void customerCancelPaidOrderRefundsAutomatically() throws Exception {
        String customer = customerToken("WECHAT", "mock:cancel-" + UUID.randomUUID());
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 2)));
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(json("reason", "点错了")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
        // Mock 渠道立即成功：退款单 SUCCESS，订单 refund_status=FULL
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
        String customer = customerToken("WECHAT", "mock:reject-" + UUID.randomUUID());
        mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/m/dishes/2/stock"), owner)
                .contentType(MediaType.APPLICATION_JSON).content(json("stockQuantity", 5))).andExpect(status().isOk());
        try {
            String orderNo = createOrder(customer, List.of(item(2, List.of(), List.of(), 2)));
            payMock(customer, orderNo);
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
        String customer = customerToken("WECHAT", "mock:item-" + UUID.randomUUID());
        // 奶茶中杯 ×2 (2400) + 红烧肉 ×1 (3800) = 6200
        String orderNo = createOrder(customer, List.of(item(3, List.of(1L), List.of(), 2), item(1, List.of(), List.of(), 1)));
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff)).andExpect(status().isOk());

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
                // 响应在事务内构建，渠道调用在提交后：先返回 PROCESSING，Mock 渠道随即成功
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
        String customer = customerToken("WECHAT", "mock:fail-" + UUID.randomUUID());
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), owner)).andExpect(status().isOk());

        // 原因含 mock-fail → 渠道失败
        MvcResult r = mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/refunds"), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("type", "FULL", "reason", "mock-fail 余额不足"))))
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
        String customer = customerToken("WECHAT", "mock:withdraw-" + UUID.randomUUID());
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        payMock(customer, orderNo);
        mvc.perform(authed(post("/api/v1/m/orders/" + orderNo + "/accept"), staff)).andExpect(status().isOk());
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
        String customer = customerToken("WECHAT", "mock:dash-" + UUID.randomUUID());
        String orderNo = createOrder(customer, List.of(item(1, List.of(), List.of(), 1)));
        payMock(customer, orderNo);

        // 需求 §4：数据看板仅店主
        mvc.perform(authed(get("/api/v1/m/dashboard/today"), staff)).andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/v1/m/dashboard/today"), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderCount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.paidAmount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(3800)))
                .andExpect(jsonPath("$.data.topDishes[0].dishName").isNotEmpty())
                .andExpect(jsonPath("$.data.daily.length()").value(7));

        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), staff))
                .andExpect(status().isForbidden());
        MvcResult r = mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), owner))
                .andExpect(status().isOk())
                .andReturn();
        String csv = r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿记录类型,订单号");
        assertThat(csv).contains(orderNo).contains("38.00").contains("微信");
    }

    // ==================== 工具 ====================

    private String createOrder(String customer, List<Map<String, Object>> items) throws Exception {
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(orderBody(UUID.randomUUID().toString(), items))))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("orderNo").asText();
    }

    private void payMock(String customer, String orderNo) throws Exception {
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer)).andExpect(status().isOk());
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/mock-pay"), customer)).andExpect(status().isOk());
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
