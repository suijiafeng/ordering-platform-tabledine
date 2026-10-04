package com.example.ordering.module.menu.dto;

import com.example.ordering.module.menu.entity.Dish;

/** 商家端菜品列表项 */
public record DishView(Long id, Long categoryId, String name, String description, Long price, String image,
                       Integer sort, Integer status, boolean soldOut, Integer stockQuantity) {

    public static DishView of(Dish d) {
        return new DishView(d.getId(), d.getCategoryId(), d.getName(), d.getDescription(), d.getPrice(),
                d.getImage(), d.getSort(), d.getStatus(), Boolean.TRUE.equals(d.getIsSoldOut()), d.getStockQuantity());
    }
}
