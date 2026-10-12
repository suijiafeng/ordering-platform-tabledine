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

class CheckoutRecoveryIntegrationTest extends AbstractIntegrationTest {

    @Test
    void requestLookupIsReadOnlyAndScopedToTheAuthenticatedCustomer() throws Exception {
        String customer = memberToken();
        String other = memberToken();
        String requestId = UUID.randomUUID().toString();
        String lookup = "/api/v1/c/orders/by-request/" + requestId;
        assertThat(getData(lookup, customer).isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE client_request_id = ?", Integer.class, requestId)).isZero();
        mvc.perform(get(lookup)).andExpect(status().isUnauthorized());

        String body = json("clientRequestId", requestId, "qrToken", "dev-table-a1", "peopleCount", 2,
                "remark", "原订单", "items", List.of(Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1)));
        MvcResult created = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn();
        String orderNo = data(created).path("orderNo").asText();

        // 模拟下单响应丢失：只读查询恢复原订单，不创建第二笔订单、不扣款。
        JsonNode recovered = getData(lookup, customer);
        assertThat(recovered.path("orderNo").asText()).isEqualTo(orderNo);
        assertThat(recovered.path("status").asText()).isEqualTo("PENDING_PAY");
        assertThat(recovered.path("remark").asText()).isEqualTo("原订单");
        assertThat(getData(lookup, other).isNull()).isTrue();
        mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.orderNo").value(orderNo));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE client_request_id = ?", Integer.class, requestId)).isEqualTo(1);

        // 明确取消后，同一查询可以确认终态，让客户端安全解除阻塞。
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), customer)).andExpect(status().isOk());
        assertThat(getData(lookup, customer).path("status").asText()).isEqualTo("CLOSED");
    }
}
