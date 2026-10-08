package com.example.ordering.module.auth.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.auth.dto.RefreshTokenRequest;
import com.example.ordering.module.auth.dto.StaffLoginRequest;
import com.example.ordering.module.auth.dto.StaffProfile;
import com.example.ordering.module.auth.dto.StaffTokenResponse;
import com.example.ordering.module.auth.service.StaffAuthService;
import com.example.ordering.ratelimit.ClientIp;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "员工认证")
@RestController
public class StaffAuthController {

    private final StaffAuthService staffAuthService;

    public StaffAuthController(StaffAuthService staffAuthService) {
        this.staffAuthService = staffAuthService;
    }

    @Operation(summary = "员工登录（账号密码）")
    @RateLimit(permits = 20, windowSeconds = 60)
    @PostMapping("/api/v1/m/auth/login")
    public Result<StaffTokenResponse> login(@Valid @RequestBody StaffLoginRequest req, HttpServletRequest http) {
        return Result.ok(staffAuthService.login(req, ClientIp.of(http)));
    }

    @Operation(summary = "刷新 token")
    @RateLimit(permits = 30, windowSeconds = 60)
    @PostMapping("/api/v1/m/auth/refresh")
    public Result<StaffTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest req) {
        return Result.ok(staffAuthService.refresh(req));
    }

    @Operation(summary = "当前员工信息")
    @GetMapping("/api/v1/m/auth/me")
    public Result<StaffProfile> me() {
        return Result.ok(staffAuthService.currentProfile());
    }
}
