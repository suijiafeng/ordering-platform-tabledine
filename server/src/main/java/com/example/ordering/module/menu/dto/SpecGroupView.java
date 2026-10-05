package com.example.ordering.module.menu.dto;

import java.util.List;

public record SpecGroupView(Long id, String name, boolean required, List<SpecItemView> items) {

    public record SpecItemView(Long id, String name, long priceDelta, boolean isDefault) {
    }
}
