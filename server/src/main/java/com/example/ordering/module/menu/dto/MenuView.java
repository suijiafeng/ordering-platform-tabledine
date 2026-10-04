package com.example.ordering.module.menu.dto;

import java.util.List;

/** 顾客端完整菜单 */
public record MenuView(Long storeId, List<MenuCategory> categories) {

    public record MenuCategory(Long id, String name, List<MenuDish> dishes) {
    }

    public record MenuDish(Long id, String name, String description, long price, String image, boolean soldOut,
                           List<SpecGroupView> specGroups, List<AddonGroupView> addonGroups) {
    }
}
