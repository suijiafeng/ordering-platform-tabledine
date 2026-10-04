package com.example.ordering.module.auth.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.auth.dto.CustomerLoginRequest;
import com.example.ordering.module.auth.dto.CustomerLoginResponse;
import com.example.ordering.module.auth.dto.CustomerProfile;
import com.example.ordering.module.auth.service.CustomerAuthService;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "顾客认证")
@RestController
public class CustomerAuthController {

    private final CustomerAuthService customerAuthService;

    public CustomerAuthController(CustomerAuthService customerAuthService) {
        this.customerAuthService = customerAuthService;
    }

    @Operation(summary = "小程序静默登录（platform + code）")
    @RateLimit(permits = 30, windowSeconds = 60)
    @PostMapping("/api/v1/c/auth/login")
    public Result<CustomerLoginResponse> login(@Valid @RequestBody CustomerLoginRequest req) {
        return Result.ok(customerAuthService.login(req));
    }

    @Operation(summary = "当前顾客信息")
    @GetMapping("/api/v1/c/me")
    public Result<CustomerProfile> me() {
        return Result.ok(customerAuthService.currentProfile());
    }
}
