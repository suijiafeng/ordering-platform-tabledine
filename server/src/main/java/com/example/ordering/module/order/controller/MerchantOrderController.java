package com.example.ordering.module.order.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.order.dto.CancelRequest;
import com.example.ordering.module.order.dto.NewOrderCount;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.service.MerchantOrderService;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

@Tag(name = "商家端-订单")
@Validated
@RestController
@RequestMapping("/api/v1/m/orders")
public class MerchantOrderController {

    private final MerchantOrderService service;

    public MerchantOrderController(MerchantOrderService service) {
        this.service = service;
    }

    @Operation(summary = "订单列表（status 逗号分隔；keyword 匹配订单号 / 桌号；date=yyyy-MM-dd）")
    @GetMapping
    public Result<PageResult<OrderSummary>> list(@RequestParam(required = false) String status,
                                                 @RequestParam(required = false) String keyword,
                                                 @RequestParam(required = false) String date,
                                                 @RequestParam(defaultValue = "1") @Min(1) int page,
                                                 @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize) {
        return Result.ok(service.list(status, keyword, date, page, pageSize));
    }

    @Operation(summary = "后厨队列：待制作 + 制作中")
    @GetMapping("/kitchen")
    public Result<List<OrderSummary>> kitchen() {
        return Result.ok(service.kitchenQueue());
    }

    @Operation(summary = "新订单轮询（since 之后新支付的订单数与待处理数量）")
    @GetMapping("/new-count")
    public Result<NewOrderCount> newCount(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        return Result.ok(service.newCount(since));
    }

    @Operation(summary = "订单详情")
    @GetMapping("/{orderNo}")
    public Result<OrderDetail> detail(@PathVariable String orderNo) {
        return Result.ok(service.detail(orderNo));
    }

    @Operation(summary = "接单（进入制作中）")
    @PostMapping("/{orderNo}/accept")
    public Result<OrderDetail> accept(@PathVariable String orderNo) {
        return Result.ok(service.accept(orderNo));
    }

    @Operation(summary = "拒单（全额退款）")
    @PostMapping("/{orderNo}/reject")
    public Result<OrderDetail> reject(@PathVariable String orderNo, @Valid @RequestBody(required = false) CancelRequest req) {
        return Result.ok(service.reject(orderNo, req == null ? null : req.reason()));
    }

    @Operation(summary = "出餐完成")
    @PostMapping("/{orderNo}/ready")
    public Result<OrderDetail> ready(@PathVariable String orderNo) {
        return Result.ok(service.ready(orderNo));
    }

    @Operation(summary = "送达完成")
    @PostMapping("/{orderNo}/deliver")
    public Result<OrderDetail> deliver(@PathVariable String orderNo) {
        return Result.ok(service.deliver(orderNo));
    }

    @Operation(summary = "整单取消（店主，全额退款）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{orderNo}/cancel")
    public Result<OrderDetail> cancel(@PathVariable String orderNo, @Valid @RequestBody CancelRequest req) {
        return Result.ok(service.cancel(orderNo, req.reason()));
    }

    @Operation(summary = "商家主动退款（整单 / 按菜品 / 自定义金额，仅店主）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{orderNo}/refunds")
    public Result<RefundView> refund(@PathVariable String orderNo, @Valid @RequestBody MerchantRefundRequest req) {
        return Result.ok(service.refund(orderNo, req));
    }
}
