package com.example.ordering.module.table.dto;

import com.example.ordering.module.table.entity.DiningTable;

/**
 * 商家端桌台信息。qrUrl 为桌码内容（普通链接二维码），由商家端生成二维码图片并打印。
 */
public record TableView(Long id, String code, Integer status, String qrToken, String qrUrl) {

    public static TableView of(DiningTable t, String qrBaseUrl) {
        return new TableView(t.getId(), t.getCode(), t.getStatus(), t.getQrToken(), qrBaseUrl + t.getQrToken());
    }
}
