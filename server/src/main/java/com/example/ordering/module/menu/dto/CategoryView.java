package com.example.ordering.module.menu.dto;

import com.example.ordering.module.menu.entity.Category;

public record CategoryView(Long id, String name, Integer sort, Integer status) {

    public static CategoryView of(Category c) {
        return new CategoryView(c.getId(), c.getName(), c.getSort(), c.getStatus());
    }
}
