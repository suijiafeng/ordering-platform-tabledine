package com.example.ordering.module.auth.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.auth.dto.CustomerChangePasswordRequest;
import com.example.ordering.module.auth.dto.PasswordLoginRequest;
import com.example.ordering.ratelimit.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PutMapping;
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

    @Operation(summary = "会员密码登录（手机号 + 密码，账号由商家后台创建）")
    @RateLimit(permits = 10, windowSeconds = 60)
    @PostMapping("/api/v1/c/auth/password-login")
    public Result<CustomerLoginResponse> passwordLogin(@Valid @RequestBody PasswordLoginRequest req, HttpServletRequest request) {
        return Result.ok(customerAuthService.passwordLogin(req, ClientIp.of(request)));
    }

    @Operation(summary = "当前顾客信息（会员含手机号与余额）")
    @GetMapping("/api/v1/c/me")
    public Result<CustomerProfile> me() {
        return Result.ok(customerAuthService.currentProfile());
    }

    @Operation(summary = "会员修改自己的密码（成功后需重新登录）")
    @RateLimit(permits = 5, windowSeconds = 60)
    @PutMapping("/api/v1/c/me/password")
    public Result<Void> changePassword(@Valid @RequestBody CustomerChangePasswordRequest req, HttpServletRequest request) {
        customerAuthService.changeOwnPassword(req, ClientIp.of(request));
        return Result.ok();
    }
}
