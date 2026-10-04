package com.example.ordering.staff;

import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StaffIntegrationTest extends AbstractIntegrationTest {

    @Test
    void ownerManagesStaffLifecycle() throws Exception {
        String owner = ownerToken();
        String username = "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);

        // 店员无权访问
        mvc.perform(authed(get("/api/v1/m/staff"), staffToken())).andExpect(status().isForbidden());

        // 新建 → 可登录
        MvcResult r = mvc.perform(authed(post("/api/v1/m/staff"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("username", username, "name", "新店员", "password", "pass1234")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("STAFF"))
                .andExpect(jsonPath("$.data.enabled").value(true))
                .andReturn();
        long id = data(r).path("id").asLong();
        String token = staffLogin(username, "pass1234").path("accessToken").asText();
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), token)).andExpect(status().isOk());

        // 账号重复 → 409；弱密码 → 422
        mvc.perform(authed(post("/api/v1/m/staff"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("username", username, "name", "x", "password", "pass1234")))
                .andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/m/staff"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("username", username + "b", "name", "x", "password", "123")))
                .andExpect(status().isUnprocessableEntity());

        // 重置密码 → 旧 token 失效，新密码可登录
        mvc.perform(authed(put("/api/v1/m/staff/" + id), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("name", "改名了", "password", "newpass99")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("改名了"));
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), token)).andExpect(status().isUnauthorized());
        token = staffLogin(username, "newpass99").path("accessToken").asText();

        // 停用 → 会话立即失效、不能登录；列表能看到
        mvc.perform(authed(patch("/api/v1/m/staff/" + id + "/status"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("enabled", false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false));
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/m/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("username", username, "password", "newpass99")))
                .andExpect(status().isUnauthorized());
        assertThat(getData("/api/v1/m/staff", owner).findValuesAsText("username")).contains(username, "admin");

        // 不能停用自己 / 店主
        mvc.perform(authed(patch("/api/v1/m/staff/1/status"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("enabled", false)))
                .andExpect(status().isConflict());
    }

    @Test
    void staffChangesOwnPassword() throws Exception {
        String owner = ownerToken();
        String username = "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        mvc.perform(authed(post("/api/v1/m/staff"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("username", username, "name", "改密", "password", "pass1234"))).andExpect(status().isOk());
        String token = staffLogin(username, "pass1234").path("accessToken").asText();

        mvc.perform(authed(put("/api/v1/m/staff/me/password"), token).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", "wrong", "newPassword", "abcdef12")))
                .andExpect(status().isUnauthorized());
        mvc.perform(authed(put("/api/v1/m/staff/me/password"), token).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", "pass1234", "newPassword", "abcdef12")))
                .andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/m/orders/new-count"), token)).andExpect(status().isUnauthorized());
        staffLogin(username, "abcdef12");
    }
}
