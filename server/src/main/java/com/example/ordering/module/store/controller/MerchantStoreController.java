package com.example.ordering.module.store.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.store.dto.StoreDetail;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.security.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "商家端-店铺")
@RestController
public class MerchantStoreController {

    private final StoreService storeService;

    public MerchantStoreController(StoreService storeService) {
        this.storeService = storeService;
    }

    @Operation(summary = "当前门店信息与业务参数")
    @GetMapping("/api/v1/m/store")
    public Result<StoreDetail> current() {
        return Result.ok(StoreDetail.of(storeService.getRequired(LoginUser.currentStaff().storeId())));
    }
}
