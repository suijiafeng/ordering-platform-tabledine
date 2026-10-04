package com.example.ordering.module.table.dto;

/** 扫码解析结果 */
public record QrResolveView(Long storeId, String storeName, boolean storeOpen, Long tableId, String tableCode) {
}
