package com.example.ordering.module.wallet.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.wallet.dto.WalletTransactionView;
import com.example.ordering.module.wallet.service.WalletService;
import com.example.ordering.security.LoginUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "顾客端-钱包")
@Validated
@RestController
@RequestMapping("/api/v1/c/wallet")
public class CustomerWalletController {

    private final WalletService walletService;

    public CustomerWalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    @Operation(summary = "我的余额流水（充值 / 扣费 / 退款返还），按时间倒序")
    @GetMapping("/transactions")
    public Result<PageResult<WalletTransactionView>> transactions(@RequestParam(defaultValue = "1") @Min(1) int page,
                                                                  @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(walletService.transactions(LoginUser.currentCustomer().id(), page, pageSize));
    }
}
