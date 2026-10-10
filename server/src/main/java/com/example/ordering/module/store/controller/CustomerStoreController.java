package com.example.ordering.module.store.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.store.dto.StoreView;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "顾客端-店铺")
@RestController
public class CustomerStoreController {

    private final StoreService storeService;

    public CustomerStoreController(StoreService storeService) {
        this.storeService = storeService;
    }

    @Operation(summary = "店铺信息（含营业状态）")
    @RateLimit(permits = 300, windowSeconds = 60)
    @GetMapping("/api/v1/c/stores/{storeId}")
    public Result<StoreView> get(@PathVariable Long storeId) {
        return Result.ok(StoreView.of(storeService.getRequired(storeId)));
    }
}
