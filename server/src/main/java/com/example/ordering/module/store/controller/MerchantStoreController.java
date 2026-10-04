package com.example.ordering.module.store.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.store.dto.BusinessStatusRequest;
import com.example.ordering.module.store.dto.StoreDetail;
import com.example.ordering.module.store.dto.StoreUpdateRequest;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.security.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @Operation(summary = "修改店铺信息与业务参数（店主）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/api/v1/m/store")
    public Result<StoreDetail> update(@Valid @RequestBody StoreUpdateRequest req) {
        return Result.ok(StoreDetail.of(storeService.update(LoginUser.currentStaff().storeId(), req)));
    }

    @Operation(summary = "切换营业状态（店主）")
    @PreAuthorize("hasRole('OWNER')")
    @PatchMapping("/api/v1/m/store/business-status")
    public Result<StoreDetail> updateBusinessStatus(@Valid @RequestBody BusinessStatusRequest req) {
        return Result.ok(StoreDetail.of(storeService.updateBusinessStatus(LoginUser.currentStaff().storeId(), req.open())));
    }
}
