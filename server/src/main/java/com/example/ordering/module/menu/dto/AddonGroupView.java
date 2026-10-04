package com.example.ordering.module.menu.dto;

import java.util.List;

public record AddonGroupView(Long id, String name, int maxCount, List<AddonItemView> items) {

    public record AddonItemView(Long id, String name, long priceDelta) {
    }
}
