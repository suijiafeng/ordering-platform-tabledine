package com.example.ordering.menu;

import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MenuIntegrationTest extends AbstractIntegrationTest {

    @Test
    void ownerCreatesDishAndCustomerSeesIt() throws Exception {
        String owner = ownerToken();
        long categoryId = createCategory(owner, "测试分类-" + System.nanoTime());

        Map<String, Object> dish = dishBody(categoryId, "测试拿铁", 2000L);
        MvcResult r = mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dish)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dish.price").value(2000))
                .andExpect(jsonPath("$.data.specGroups[0].items.length()").value(2))
                .andExpect(jsonPath("$.data.addonGroups[0].maxCount").value(2))
                .andReturn();
        long dishId = data(r).path("dish").path("id").asLong();

        JsonNode menuDish = findMenuDish(dishId);
        assertThat(menuDish).isNotNull();
        assertThat(menuDish.path("soldOut").asBoolean()).isFalse();
        assertThat(menuDish.path("specGroups").get(0).path("items").get(1).path("priceDelta").asLong()).isEqualTo(500);

        // 修改：去掉加料组，规格整体替换
        Map<String, Object> updated = dishBody(categoryId, "测试拿铁（改）", 2200L);
        updated.put("addonGroups", List.of());
        mvc.perform(authed(put("/api/v1/m/dishes/" + dishId), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(updated)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dish.name").value("测试拿铁（改）"))
                .andExpect(jsonPath("$.data.addonGroups.length()").value(0));
        Integer activeSpecGroups = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dish_spec_group WHERE dish_id = ? AND deleted = 0", Integer.class, dishId);
        assertThat(activeSpecGroups).isEqualTo(1);

        // 下架后顾客端不可见
        mvc.perform(authed(patch("/api/v1/m/dishes/" + dishId + "/status"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("status", 0)))
                .andExpect(status().isOk());
        assertThat(findMenuDish(dishId)).isNull();
    }

    @Test
    void editingDishKeepsSpecIdsSoCustomerCartsStayValid() throws Exception {
        String owner = ownerToken();
        long categoryId = createCategory(owner, "规格同步-" + System.nanoTime());
        MvcResult created = mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dishBody(categoryId, "同步测试", 2000L))))
                .andExpect(status().isOk()).andReturn();
        JsonNode detail = data(created);
        long dishId = detail.path("dish").path("id").asLong();
        JsonNode group = detail.path("specGroups").get(0);
        long groupId = group.path("id").asLong();
        long mediumId = group.path("items").get(0).path("id").asLong();
        long largeId = group.path("items").get(1).path("id").asLong();
        long addonGroupId = detail.path("addonGroups").get(0).path("id").asLong();

        // 带 id 重新保存：改名、改价、去掉「大杯」、新增「超大杯」，加料组原样带回
        Map<String, Object> body = dishBody(categoryId, "同步测试", 2000L);
        body.put("specGroups", List.of(Map.of("id", groupId, "name", "杯型（改）", "required", true, "items", List.of(
                Map.of("id", mediumId, "name", "中杯（改）", "priceDelta", 100, "isDefault", true),
                Map.of("name", "超大杯", "priceDelta", 800)))));
        body.put("addonGroups", List.of(Map.of("id", addonGroupId, "name", "加料", "maxCount", 1, "items", List.of(
                Map.of("name", "燕麦", "priceDelta", 300)))));
        MvcResult updated = mvc.perform(authed(put("/api/v1/m/dishes/" + dishId), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk()).andReturn();
        JsonNode after = data(updated).path("specGroups").get(0);
        assertThat(after.path("id").asLong()).isEqualTo(groupId);
        assertThat(after.path("name").asText()).isEqualTo("杯型（改）");
        assertThat(after.path("items").get(0).path("id").asLong()).isEqualTo(mediumId);  // 原地更新，id 不变
        assertThat(after.path("items").get(0).path("priceDelta").asLong()).isEqualTo(100);
        assertThat(after.path("items").get(1).path("id").asLong()).isNotEqualTo(largeId);  // 新项拿到新 id
        assertThat(after.path("items").size()).isEqualTo(2);
        assertThat(data(updated).path("addonGroups").get(0).path("id").asLong()).isEqualTo(addonGroupId);
        assertThat(jdbc.queryForObject("SELECT deleted FROM dish_spec_item WHERE id = ?", Integer.class, largeId)).isEqualTo(1);

        // 冒用别的菜的规格项 id：当作新建，不会改到别人的数据
        Long foreignItem = jdbc.queryForObject(
                "SELECT i.id FROM dish_spec_item i JOIN dish_spec_group g ON g.id = i.group_id WHERE g.dish_id = 3 AND i.deleted = 0 LIMIT 1", Long.class);
        String foreignName = jdbc.queryForObject("SELECT name FROM dish_spec_item WHERE id = ?", String.class, foreignItem);
        body.put("specGroups", List.of(Map.of("id", groupId, "name", "杯型（改）", "required", true, "items", List.of(
                Map.of("id", mediumId, "name", "中杯（改）", "priceDelta", 100, "isDefault", true),
                Map.of("id", foreignItem, "name", "篡改", "priceDelta", 0)))));
        mvc.perform(authed(put("/api/v1/m/dishes/" + dishId), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT name FROM dish_spec_item WHERE id = ?", String.class, foreignItem)).isEqualTo(foreignName);
    }

    @Test
    void clearingDescriptionAndImagePersists() throws Exception {
        String owner = ownerToken();
        long categoryId = createCategory(owner, "清空测试-" + System.nanoTime());

        Map<String, Object> dish = dishBody(categoryId, "带描述的菜", 1500L);
        dish.put("description", "很好吃");
        dish.put("image", "/uploads/test.jpg");
        MvcResult r = mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dish)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dish.description").value("很好吃"))
                .andReturn();
        long dishId = data(r).path("dish").path("id").asLong();

        // 清空描述与图片后保存，再次读取应为 null 而不是残留旧值
        Map<String, Object> cleared = dishBody(categoryId, "带描述的菜", 1500L);
        cleared.put("description", null);
        cleared.put("image", null);
        mvc.perform(authed(put("/api/v1/m/dishes/" + dishId), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(cleared)))
                .andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/m/dishes/" + dishId), owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dish.description").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.dish.image").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void staffCanToggleSoldOutButCannotEditMenu() throws Exception {
        String staff = staffToken();
        // 种子菜品 1：红烧肉
        mvc.perform(authed(patch("/api/v1/m/dishes/1/sold-out"), staff)
                        .contentType(MediaType.APPLICATION_JSON).content(json("soldOut", true)))
                .andExpect(status().isOk());
        assertThat(findMenuDish(1L).path("soldOut").asBoolean()).isTrue();

        mvc.perform(authed(patch("/api/v1/m/dishes/1/sold-out"), staff)
                        .contentType(MediaType.APPLICATION_JSON).content(json("soldOut", false)))
                .andExpect(status().isOk());

        mvc.perform(authed(post("/api/v1/m/categories"), staff)
                        .contentType(MediaType.APPLICATION_JSON).content(json("name", "店员不能建")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40301));

        // 查看菜品列表所有员工可用
        mvc.perform(authed(get("/api/v1/m/dishes"), staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").isNumber());
    }

    @Test
    void stockZeroShowsSoldOutAndNullRestores() throws Exception {
        String owner = ownerToken();
        mvc.perform(authed(put("/api/v1/m/dishes/2/stock"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":0}"))
                .andExpect(status().isOk());
        assertThat(findMenuDish(2L).path("soldOut").asBoolean()).isTrue();

        mvc.perform(authed(put("/api/v1/m/dishes/2/stock"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":null}"))
                .andExpect(status().isOk());
        assertThat(findMenuDish(2L).path("soldOut").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM dish WHERE id = 2", Integer.class)).isNull();
    }

    @Test
    void validationRules() throws Exception {
        String owner = ownerToken();
        long categoryId = createCategory(owner, "校验分类-" + System.nanoTime());

        // 加料组最多可选数量超过加料项数量
        Map<String, Object> bad = dishBody(categoryId, "坏菜品", 100L);
        bad.put("addonGroups", List.of(Map.of("name", "小料", "maxCount", 5,
                "items", List.of(Map.of("name", "珍珠", "priceDelta", 100)))));
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(bad)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(42201));

        // 价格为负
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dishBody(categoryId, "负价", -1L))))
                .andExpect(jsonPath("$.code").value(42201));

        // 分类下有菜品时不能删除
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dishBody(categoryId, "占位菜", 100L))))
                .andExpect(status().isOk());
        mvc.perform(authed(delete("/api/v1/m/categories/" + categoryId), owner))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(40901));
    }

    @Test
    void priceMustStayPositiveForEverySelection() throws Exception {
        String owner = ownerToken();
        long categoryId = createCategory(owner, "价格校验-" + System.nanoTime());
        // 0 元菜品（渠道不受理 0 元支付）
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dishBody(categoryId, "零元", 0L))))
                .andExpect(status().isUnprocessableEntity());
        // 必选规格把单价减成负数：300 + (-500)
        Map<String, Object> neg = dishBody(categoryId, "负规格", 300L);
        neg.put("specGroups", List.of(Map.of("name", "份量", "required", true,
                "items", List.of(Map.of("name", "小份", "priceDelta", -500), Map.of("name", "大份", "priceDelta", 0)))));
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(neg)))
                .andExpect(status().isUnprocessableEntity());
        // 基础价 0 + 必选规格全为正价：允许（按规格定价）
        Map<String, Object> bySize = dishBody(categoryId, "按杯型定价", 0L);
        bySize.put("specGroups", List.of(Map.of("name", "杯型", "required", true,
                "items", List.of(Map.of("name", "中杯", "priceDelta", 1200), Map.of("name", "大杯", "priceDelta", 1500)))));
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(bySize)))
                .andExpect(status().isOk());
    }

    @Test
    void otherStoresDataIsInvisible() throws Exception {
        jdbc.update("INSERT INTO store (id, name) VALUES (900, '隔壁店') ON CONFLICT (id) DO NOTHING");
        jdbc.update("INSERT INTO category (id, store_id, name) VALUES (900, 900, '隔壁分类') ON CONFLICT (id) DO NOTHING");
        jdbc.update("INSERT INTO dish (id, store_id, category_id, name, price) VALUES (900, 900, 900, '隔壁菜', 100) "
                + "ON CONFLICT (id) DO NOTHING");
        String owner = ownerToken();

        mvc.perform(authed(get("/api/v1/m/dishes/900"), owner))
                .andExpect(status().isNotFound());
        mvc.perform(authed(patch("/api/v1/m/dishes/900/sold-out"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("soldOut", true)))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT is_sold_out FROM dish WHERE id = 900", Boolean.class)).isFalse();

        JsonNode categories = getData("/api/v1/m/categories", owner);
        for (JsonNode c : categories) {
            assertThat(c.path("id").asLong()).isNotEqualTo(900L);
        }
        // 用本店分类挂隔壁菜品：分类校验同样受门店隔离
        mvc.perform(authed(post("/api/v1/m/dishes"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(dishBody(900L, "越权", 100L))))
                .andExpect(status().isNotFound());
        assertThat(findMenuDish(900L)).isNull();
    }

    // ---------- helpers ----------

    private long createCategory(String owner, String name) throws Exception {
        MvcResult r = mvc.perform(authed(post("/api/v1/m/categories"), owner)
                        .contentType(MediaType.APPLICATION_JSON).content(json("name", name)))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("id").asLong();
    }

    private static Map<String, Object> dishBody(long categoryId, String name, long price) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("categoryId", categoryId);
        body.put("name", name);
        body.put("price", price);
        body.put("specGroups", List.of(Map.of("name", "杯型", "required", true, "items", List.of(
                Map.of("name", "中杯", "priceDelta", 0, "isDefault", true),
                Map.of("name", "大杯", "priceDelta", 500)))));
        body.put("addonGroups", List.of(Map.of("name", "加料", "maxCount", 2, "items", List.of(
                Map.of("name", "燕麦", "priceDelta", 300),
                Map.of("name", "浓缩", "priceDelta", 400)))));
        return body;
    }

    /** 在门店 1 的顾客端菜单里查找菜品，找不到返回 null */
    private JsonNode findMenuDish(long dishId) throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/c/stores/1/menu")).andExpect(status().isOk()).andReturn();
        for (JsonNode c : data(r).path("categories")) {
            for (JsonNode d : c.path("dishes")) {
                if (d.path("id").asLong() == dishId) {
                    return d;
                }
            }
        }
        return null;
    }
}
