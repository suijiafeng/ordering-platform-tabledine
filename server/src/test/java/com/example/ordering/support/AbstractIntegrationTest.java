package com.example.ordering.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import com.example.ordering.module.pay.channel.BalancePayChannel;
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

    protected static final String MEMBER_PASSWORD = "pw123456";
    /** 测试会员手机号：从随机起点递增，避免与种子数据及其他测试类冲突 */
    private static final java.util.concurrent.atomic.AtomicLong MEMBER_SEQ =
            new java.util.concurrent.atomic.AtomicLong(java.util.concurrent.ThreadLocalRandom.current().nextLong(10_000_000, 90_000_000));

    /**
     * 余额退款执行器的 spy：默认走真实实现；测试里可注入「返还出错 / 返还成功但响应丢失 / 查询出错」等故障。
     * 放在基类里，所有测试类共用同一个 Spring 上下文；每个测试结束后自动重置。
     */
    @SpyBean
    protected BalancePayChannel balanceChannel;

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

    /** 新建一个余额充足（1 万元）的会员并登录，返回顾客 token */
    protected String memberToken() throws Exception {
        String phone = "139" + String.format("%08d", MEMBER_SEQ.incrementAndGet() % 100_000_000);
        mvc.perform(authed(post("/api/v1/m/members"), ownerToken()).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "测试会员", "password", MEMBER_PASSWORD, "initialAmount", 1_000_000)))
                .andExpect(status().isOk());
        return memberLogin(phone, MEMBER_PASSWORD);
    }

    protected String memberLogin(String phone, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/c/auth/password-login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "password", password)))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("token").asText();
    }

    /** 余额支付：发起即扣费入账 */
    protected void pay(String customer, String orderNo) throws Exception {
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), customer)).andExpect(status().isOk());
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
