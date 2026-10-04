package com.example.ordering.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 认证闭环集成测试（需要本机 Docker；没有 Docker 时自动跳过）。
 * 覆盖需求 v1.2 验收标准 US-5，以及扫码解析 US-1 AC3。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class AuthFlowIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

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
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"staff\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(40102));
        }
        // 达到失败上限后，即使密码正确也被锁定
        mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"staff\",\"password\":\"staff123\"}"))
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
        String t1 = customerLogin("WECHAT", "mock:alice");
        String t2 = customerLogin("WECHAT", "mock:alice");
        String id1 = me(t1).path("id").asText();
        assertThat(me(t2).path("id").asText()).isEqualTo(id1);

        // 同一个 openId 在支付宝上是另一位顾客
        String alipay = customerLogin("ALIPAY", "mock:alice");
        JsonNode alipayMe = me(alipay);
        assertThat(alipayMe.path("id").asText()).isNotEqualTo(id1);
        assertThat(alipayMe.path("platform").asText()).isEqualTo("ALIPAY");
    }

    @Test
    void tokensCannotCrossAudience() throws Exception {
        String customer = customerLogin("WECHAT", "mock:bob");
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

    private JsonNode staffLogin(String username, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString()).path("data");
    }

    private String customerLogin(String platform, String code) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/c/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platform\":\"" + platform + "\",\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString()).path("data").path("token").asText();
    }

    private JsonNode me(String token) throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/c/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString()).path("data");
    }
}
