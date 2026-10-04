package com.example.ordering.module.menu.dto;

import java.util.List;

/** 商家端菜品详情（含规格、加料），用于编辑 */
public record DishDetail(DishView dish, List<SpecGroupView> specGroups, List<AddonGroupView> addonGroups) {
}
