package com.example.ordering.module.store.dto;

import com.example.ordering.module.store.entity.Store;

/** 顾客端可见的店铺信息 */
public record StoreView(Long id, String name, String logo, String phone, String address,
                        String businessHours, boolean open) {

    public static StoreView of(Store s) {
        return new StoreView(s.getId(), s.getName(), s.getLogo(), s.getPhone(), s.getAddress(),
                s.getBusinessHours(), s.isOpen());
    }
}
