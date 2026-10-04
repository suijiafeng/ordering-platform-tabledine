package com.example.ordering.module.file.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.file.dto.UploadResult;
import com.example.ordering.module.file.service.ImageUploadService;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "商家端-文件")
@RestController
public class MerchantFileController {

    private final ImageUploadService imageUploadService;

    public MerchantFileController(ImageUploadService imageUploadService) {
        this.imageUploadService = imageUploadService;
    }

    @Operation(summary = "上传图片（JPG / PNG，≤5MB，自动压缩并生成缩略图）")
    @PreAuthorize("hasRole('OWNER')")
    @RateLimit(permits = 60, windowSeconds = 60)
    @PostMapping(value = "/api/v1/m/files/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<UploadResult> upload(@RequestParam("file") MultipartFile file) {
        return Result.ok(imageUploadService.upload(file));
    }
}
