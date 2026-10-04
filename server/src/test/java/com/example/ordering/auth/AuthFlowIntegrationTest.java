package com.example.ordering.auth;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 认证闭环集成测试。覆盖需求 v1.2 验收标准 US-5，以及扫码解析 US-1 AC3。
 */
class AuthFlowIntegrationTest extends AbstractIntegrationTest {

    @Test
    void staffLoginRefreshAndMe() throws Exception {
        JsonNode data = staffLogin("admin", "admin123");
        String access = data.path("accessToken").asText();
        assertThat(data.path("staff").path("role").asText()).isEqualTo("OWNER");

        mvc.perform(get("/api/v1/m/auth/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.username").value("admin"));

        mvc.perform(get("/api/v1/m/store").header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.payTimeoutMin").value(15));

        String refresh = data.path("refreshToken").asText();
        mvc.perform(post("/api/v1/m/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        // access token 不能当作 refresh token 使用
        mvc.perform(post("/api/v1/m/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + access + "\"}"))
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void wrongPasswordAndLockout() throws Exception {
        // 使用独立账号，避免锁定状态影响其他测试（登录锁定记录在内存中，测试类之间共享）
        jdbc.update("INSERT INTO staff (store_id, username, password_hash, name, role) "
                + "SELECT 1, 'lock_user', password_hash, '锁定测试', 'STAFF' FROM staff WHERE username = 'staff'");
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"lock_user\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(40102));
        }
        // 达到失败上限后，即使密码正确也被锁定
        mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"lock_user\",\"password\":\"staff123\"}"))
                .andExpect(jsonPath("$.code").value(40103));
    }

    @Test
    void unauthenticatedRequestsGet401() throws Exception {
        mvc.perform(get("/api/v1/m/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
        mvc.perform(get("/api/v1/c/me").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void customerSilentLoginIsStableAndIsolated() throws Exception {
        String t1 = customerToken("WECHAT", "mock:alice");
        String t2 = customerToken("WECHAT", "mock:alice");
        String id1 = me(t1).path("id").asText();
        assertThat(me(t2).path("id").asText()).isEqualTo(id1);

        // 同一个 openId 在支付宝上是另一位顾客
        String alipay = customerToken("ALIPAY", "mock:alice");
        JsonNode alipayMe = me(alipay);
        assertThat(alipayMe.path("id").asText()).isNotEqualTo(id1);
        assertThat(alipayMe.path("platform").asText()).isEqualTo("ALIPAY");
    }

    @Test
    void tokensCannotCrossAudience() throws Exception {
        String customer = customerToken("WECHAT", "mock:bob");
        mvc.perform(get("/api/v1/m/auth/me").header("Authorization", "Bearer " + customer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40301));

        String staff = staffLogin("admin", "admin123").path("accessToken").asText();
        mvc.perform(get("/api/v1/c/me").header("Authorization", "Bearer " + staff))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40301));

        // 公开接口带了另一端的 token：忽略 token，正常返回
        mvc.perform(get("/api/v1/c/qr/dev-table-a1").header("Authorization", "Bearer " + staff))
                .andExpect(status().isOk());
    }

    @Test
    void disablingStaffInvalidatesIssuedTokens() throws Exception {
        jdbc.update("INSERT INTO staff (store_id, username, password_hash, name, role) "
                + "SELECT 1, 'temp', password_hash, '临时', 'STAFF' FROM staff WHERE username = 'staff'");
        String access = staffLogin("temp", "staff123").path("accessToken").asText();
        mvc.perform(get("/api/v1/m/auth/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isOk());

        jdbc.update("UPDATE staff SET status = 0, token_version = token_version + 1 WHERE username = 'temp'");
        mvc.perform(get("/api/v1/m/auth/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void qrResolve() throws Exception {
        mvc.perform(get("/api/v1/c/qr/dev-table-a1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tableCode").value("A1"))
                .andExpect(jsonPath("$.data.storeId").value(1));
        mvc.perform(get("/api/v1/c/qr/not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40402));
        mvc.perform(get("/api/v1/c/stores/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.open").value(true));
    }

    @Test
    void validationErrorsUseUnifiedFormat() throws Exception {
        mvc.perform(post("/api/v1/c/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platform\":\"WECHAT\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));
    }

    private JsonNode me(String token) throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/c/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString()).path("data");
    }
}
