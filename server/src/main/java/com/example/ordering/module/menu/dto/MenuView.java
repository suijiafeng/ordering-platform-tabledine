package com.example.ordering.module.menu.dto;

import java.util.List;

/** 顾客端完整菜单 */
public record MenuView(Long storeId, List<MenuCategory> categories) {

    public record MenuCategory(Long id, String name, List<MenuDish> dishes) {
    }

    /**
     * @param remainingStock 限量菜品今日剩余份数（null 表示不限量）。顾客端据此限制加购数量，
     *                       避免加了 10 份、下单时才发现只剩 3 份；下单时服务端仍以扣减结果为准
     */
    public record MenuDish(Long id, String name, String description, long price, String image, boolean soldOut,
                           Integer remainingStock,
                           List<SpecGroupView> specGroups, List<AddonGroupView> addonGroups) {
    }
}
