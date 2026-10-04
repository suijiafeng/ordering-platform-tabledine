package com.example.ordering.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 集成测试基类：所有测试类共用一个 PostgreSQL 容器和一个 Spring 上下文。
 * 需要本机 Docker；没有 Docker 时自动跳过。
 * 种子数据见 db/seed/R__dev_seed.sql（店主 admin/admin123，店员 staff/staff123，桌码 dev-table-a1~a3）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
public abstract class AbstractIntegrationTest {

    /** 单例容器：随 JVM 生命周期，供所有测试类共享（Ryuk 负责退出时清理） */
    @ServiceConnection
    protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        // 没有 Docker 时不启动，交给 @Testcontainers(disabledWithoutDocker = true) 跳过测试
        if (DockerClientFactory.instance().isDockerAvailable()) {
            POSTGRES.start();
        }
    }

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper objectMapper;
    @Autowired
    protected JdbcTemplate jdbc;

    protected JsonNode staffLogin(String username, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("username", username, "password", password)))
                .andExpect(status().isOk())
                .andReturn();
        return data(r);
    }

    protected String ownerToken() throws Exception {
        return staffLogin("admin", "admin123").path("accessToken").asText();
    }

    protected String staffToken() throws Exception {
        return staffLogin("staff", "staff123").path("accessToken").asText();
    }

    protected String customerToken(String platform, String code) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/c/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("platform", platform, "code", code)))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("token").asText();
    }

    protected static MockHttpServletRequestBuilder authed(MockHttpServletRequestBuilder builder, String token) {
        return builder.header("Authorization", "Bearer " + token);
    }

    protected JsonNode getData(String url, String token) throws Exception {
        MvcResult r = mvc.perform(authed(get(url), token)).andExpect(status().isOk()).andReturn();
        return data(r);
    }

    protected JsonNode data(MvcResult r) throws Exception {
        return objectMapper.readTree(r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data");
    }

    protected String toJson(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    /** json("k1", v1, "k2", v2, ...) */
    protected String json(Object... kv) throws Exception {
        java.util.Map<String, Object> map = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], kv[i + 1]);
        }
        return objectMapper.writeValueAsString(map);
    }
}
