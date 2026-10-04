package com.example.ordering.table;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TableIntegrationTest extends AbstractIntegrationTest {

    @Test
    void createResetAndResolve() throws Exception {
        String owner = ownerToken();
        MvcResult r = mvc.perform(authed(post("/api/v1/m/tables"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("code", "T" + (System.nanoTime() % 100000))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode table = data(r);
        String oldToken = table.path("qrToken").asText();
        assertThat(oldToken).hasSize(24);
        assertThat(table.path("qrUrl").asText()).isEqualTo("https://test.example.com/q/" + oldToken);

        mvc.perform(get("/api/v1/c/qr/" + oldToken)).andExpect(status().isOk());

        // 重置后旧码失效（US-1 AC3）
        MvcResult reset = mvc.perform(authed(post("/api/v1/m/tables/" + table.path("id").asLong() + "/reset-qr"), owner))
                .andExpect(status().isOk()).andReturn();
        String newToken = data(reset).path("qrToken").asText();
        assertThat(newToken).isNotEqualTo(oldToken);
        mvc.perform(get("/api/v1/c/qr/" + oldToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40402));
        mvc.perform(get("/api/v1/c/qr/" + newToken)).andExpect(status().isOk());

        // 停用桌台后桌码失效
        mvc.perform(authed(put("/api/v1/m/tables/" + table.path("id").asLong()), owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("code", table.path("code").asText(), "status", 0)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/c/qr/" + newToken)).andExpect(status().isNotFound());
    }

    @Test
    void duplicateCodeAndBatch() throws Exception {
        String owner = ownerToken();
        mvc.perform(authed(post("/api/v1/m/tables"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("code", "A1")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(40901));

        // A1~A3 已存在（种子数据），批量 A1~A5 只新建 A4、A5
        MvcResult r = mvc.perform(authed(post("/api/v1/m/tables/batch"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("prefix", "A", "from", 1, "to", 5)))
                .andExpect(status().isOk()).andReturn();
        assertThat(data(r).size()).isEqualTo(2);

        JsonNode list = getData("/api/v1/m/tables", owner);
        assertThat(list.get(0).path("code").asText()).isEqualTo("A1");
    }

    @Test
    void storeSettingsAndBusinessStatus() throws Exception {
        String owner = ownerToken();
        mvc.perform(authed(put("/api/v1/m/store"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("name", "小馆子", "phone", "", "autoAccept", true,
                                "payTimeoutMin", 20, "acceptTimeoutMin", 8, "afterSaleHours", 12)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.autoAccept").value(true))
                .andExpect(jsonPath("$.data.phone").isEmpty());

        mvc.perform(authed(put("/api/v1/m/store"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("name", "小馆子", "autoAccept", false,
                                "payTimeoutMin", 1, "acceptTimeoutMin", 8, "afterSaleHours", 12)))
                .andExpect(jsonPath("$.code").value(42201));

        mvc.perform(authed(patch("/api/v1/m/store/business-status"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("open", false)))
                .andExpect(jsonPath("$.data.businessStatus").value(0));
        mvc.perform(get("/api/v1/c/qr/dev-table-a1")).andExpect(jsonPath("$.data.storeOpen").value(false));

        // 恢复，避免影响其他测试
        mvc.perform(authed(patch("/api/v1/m/store/business-status"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("open", true)))
                .andExpect(status().isOk());
        mvc.perform(authed(put("/api/v1/m/store"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("name", "小馆子（开发环境）", "phone", "13800000000", "autoAccept", false,
                                "payTimeoutMin", 15, "acceptTimeoutMin", 10, "afterSaleHours", 24)))
                .andExpect(status().isOk());

        String staff = staffToken();
        mvc.perform(authed(patch("/api/v1/m/store/business-status"), staff)
                        .contentType(MediaType.APPLICATION_JSON).content(json("open", false)))
                .andExpect(status().isForbidden());
    }
}
