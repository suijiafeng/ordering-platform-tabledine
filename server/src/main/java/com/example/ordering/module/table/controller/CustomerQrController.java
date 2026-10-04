package com.example.ordering.module.table.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.table.dto.QrResolveView;
import com.example.ordering.module.table.service.TableService;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "顾客端-扫码")
@RestController
public class CustomerQrController {

    private final TableService tableService;

    public CustomerQrController(TableService tableService) {
        this.tableService = tableService;
    }

    @Operation(summary = "扫码解析：返回店铺 + 桌台")
    @RateLimit(permits = 60, windowSeconds = 60)
    @GetMapping("/api/v1/c/qr/{qrToken}")
    public Result<QrResolveView> resolve(@PathVariable String qrToken) {
        return Result.ok(tableService.resolve(qrToken));
    }
}
