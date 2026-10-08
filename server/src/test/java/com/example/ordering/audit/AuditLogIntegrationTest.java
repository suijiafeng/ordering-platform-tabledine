package com.example.ordering.audit;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 审计日志：写操作（含失败）与敏感查看都留痕、密码打码、按类别检索、只追加不可改 */
class AuditLogIntegrationTest extends AbstractIntegrationTest {

    @Test
    void operationsAreAuditedWithCategoryAndSecretsMasked() throws Exception {
        String owner = ownerToken();
        long memberId = jdbc.queryForObject("SELECT id FROM customer WHERE phone IS NOT NULL ORDER BY id LIMIT 1", Long.class);

        // 充值时操作人密码错误：失败也要留痕，密码不能出现在日志里
        mvc.perform(authed(post("/api/v1/m/members/" + memberId + "/recharge"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("amount", 100, "operatorPassword", "wrong-secret-123")))
                .andExpect(status().isForbidden());
        JsonNode fund = getData("/api/v1/m/audit-logs?opType=FUND&success=false&keyword=" + memberId, owner);
        JsonNode first = fund.path("list").get(0);
        assertThat(first.path("action").asText()).isEqualTo("充值");
        assertThat(first.path("category").asText()).isEqualTo("会员");
        assertThat(first.path("errorCode").asInt()).isEqualTo(40302);
        assertThat(first.path("actorType").asText()).isEqualTo("STAFF");
        assertThat(first.path("detail").asText()).contains("***").doesNotContain("wrong-secret-123");

        // 登录失败也记录，并归到对应员工
        mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json("username", "staff", "password", "bad-password"))).andExpect(status().isUnauthorized());
        JsonNode login = getData("/api/v1/m/audit-logs?opType=LOGIN&success=false", owner);
        assertThat(login.path("list").get(0).path("detail").asText()).doesNotContain("bad-password");

        // 查看会员列表属于敏感查看，同样留痕
        mvc.perform(authed(get("/api/v1/m/members"), owner)).andExpect(status().isOk());
        assertThat(getData("/api/v1/m/audit-logs?opType=VIEW&category=会员", owner).path("total").asLong()).isPositive();

        // 只有店主能查；日志只能追加，数据库层禁止修改和删除
        mvc.perform(authed(get("/api/v1/m/audit-logs"), staffToken())).andExpect(status().isForbidden());
        assertThatThrownBy(() -> jdbc.update("UPDATE audit_log SET action = 'x'")).hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM audit_log")).hasMessageContaining("append-only");
    }
}
