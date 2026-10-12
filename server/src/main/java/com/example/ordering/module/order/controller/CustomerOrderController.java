package com.example.ordering.module.order.controller;

import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.order.dto.AbandonCheckoutResult;
import com.example.ordering.module.order.dto.CancelRequest;
import com.example.ordering.module.order.dto.CreateOrderRequest;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.dto.PayInitResult;
import com.example.ordering.module.order.service.CustomerOrderService;
import com.example.ordering.module.refund.dto.CustomerRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.ratelimit.RateLimit;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "顾客端-订单")
@Validated
@RestController
@RequestMapping("/api/v1/c")
public class CustomerOrderController {

    private final CustomerOrderService customerOrderService;

    public CustomerOrderController(CustomerOrderService customerOrderService) {
        this.customerOrderService = customerOrderService;
    }

    @Operation(summary = "创建订单（服务端重算价格；clientRequestId 幂等）")
    @RateLimit(permits = 10, windowSeconds = 60)
    @PostMapping("/orders")
    public Result<OrderDetail> create(@Valid @RequestBody CreateOrderRequest req) {
        return Result.ok(customerOrderService.create(req));
    }

    @Operation(summary = "余额支付：发起即扣费入账（余额不足 42203）")
    @RateLimit(permits = 20, windowSeconds = 60)
    @PostMapping("/orders/{orderNo}/pay")
    public Result<PayInitResult> pay(@PathVariable String orderNo) {
        return Result.ok(customerOrderService.pay(orderNo));
    }

    @Operation(summary = "订单详情（含支付、退款、状态日志）")
    @GetMapping("/orders/{orderNo}")
    public Result<OrderDetail> detail(@PathVariable String orderNo) {
        return Result.ok(customerOrderService.detail(orderNo));
    }

    @Operation(summary = "按原请求编号查询本人订单（未查到不代表原请求已失败）")
    @GetMapping("/orders/by-request/{clientRequestId}")
    public Result<OrderDetail> byRequest(@PathVariable @Size(max = 64) String clientRequestId) {
        return Result.ok(customerOrderService.detailByClientRequest(clientRequestId));
    }

    @Operation(summary = "安全放弃未生成订单的原请求；已有订单只返回详情，不自动取消或支付")
    @RateLimit(permits = 10, windowSeconds = 60)
    @PostMapping("/orders/by-request/{clientRequestId}/abandon")
    public Result<AbandonCheckoutResult> abandon(@PathVariable @NotBlank @Size(max = 64) String clientRequestId) {
        return Result.ok(customerOrderService.abandonCheckout(clientRequestId));
    }

    @Operation(summary = "历史订单")
    @GetMapping("/orders")
    public Result<PageResult<OrderSummary>> history(@RequestParam(defaultValue = "1") @Min(1) int page,
                                                    @RequestParam(defaultValue = "20") @Min(1) @Max(50) int pageSize) {
        return Result.ok(customerOrderService.history(page, pageSize));
    }

    @Operation(summary = "商家已接单后申请取消（后厨开始制作前，需商家确认）")
    @PostMapping("/orders/{orderNo}/cancel-request")
    public Result<OrderDetail> requestCancel(@PathVariable String orderNo, @Valid @RequestBody(required = false) CancelRequest req) {
        return Result.ok(customerOrderService.requestCancel(orderNo, req == null ? null : req.reason()));
    }

    @Operation(summary = "取消订单：待支付则关闭；待接单则自动全额退款（已接单请用申请取消）")
    @PostMapping("/orders/{orderNo}/cancel")
    public Result<OrderDetail> cancel(@PathVariable String orderNo, @Valid @RequestBody(required = false) CancelRequest req) {
        return Result.ok(customerOrderService.cancel(orderNo, req == null ? null : req.reason()));
    }

    @Operation(summary = "申请退款（整单或按菜品 + 原因）")
    @RateLimit(permits = 5, windowSeconds = 60)
    @PostMapping("/orders/{orderNo}/refunds")
    public Result<RefundView> applyRefund(@PathVariable String orderNo, @Valid @RequestBody CustomerRefundRequest req) {
        return Result.ok(customerOrderService.applyRefund(orderNo, req));
    }

    @Operation(summary = "退款进度")
    @GetMapping("/orders/{orderNo}/refunds")
    public Result<List<RefundView>> refunds(@PathVariable String orderNo) {
        return Result.ok(customerOrderService.refunds(orderNo));
    }

    @Operation(summary = "撤回退款申请")
    @PostMapping("/refunds/{refundNo}/withdraw")
    public Result<RefundView> withdraw(@PathVariable String refundNo) {
        return Result.ok(customerOrderService.withdrawRefund(refundNo));
    }
}
