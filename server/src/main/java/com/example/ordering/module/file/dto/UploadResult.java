package com.example.ordering.module.file.dto;

/**
 * 上传结果。url / thumbnailUrl 为站内相对路径（如 /uploads/2026/10/xxx.jpg），
 * 相对路径：商家端与顾客 H5 都与后端同域部署，直接使用。
 */
public record UploadResult(String url, String thumbnailUrl, int width, int height) {
}
