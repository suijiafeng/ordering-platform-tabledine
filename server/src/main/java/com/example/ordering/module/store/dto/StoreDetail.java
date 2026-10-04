package com.example.ordering.module.store.dto;

import com.example.ordering.module.store.entity.Store;

/** 商家端店铺信息（含业务参数） */
public record StoreDetail(Long id, String name, String logo, String phone, String address,
                          Integer businessStatus, String businessHours, Boolean autoAccept,
                          Integer payTimeoutMin, Integer acceptTimeoutMin, Integer afterSaleHours) {

    public static StoreDetail of(Store s) {
        return new StoreDetail(s.getId(), s.getName(), s.getLogo(), s.getPhone(), s.getAddress(),
                s.getBusinessStatus(), s.getBusinessHours(), s.getAutoAccept(),
                s.getPayTimeoutMin(), s.getAcceptTimeoutMin(), s.getAfterSaleHours());
    }
}
