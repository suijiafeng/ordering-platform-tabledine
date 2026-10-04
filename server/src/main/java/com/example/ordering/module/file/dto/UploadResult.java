package com.example.ordering.module.file.dto;

/**
 * 上传结果。url / thumbnailUrl 为站内相对路径（如 /uploads/2026/10/xxx.jpg），
 * 前端按需拼接域名：商家端同域直接使用，小程序拼接后端地址。
 */
public record UploadResult(String url, String thumbnailUrl, int width, int height) {
}
