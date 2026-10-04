package com.example.ordering.module.pay.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.pay.dto.UnconfirmedPaymentView;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.service.PayService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Tag(name = "商家端-支付核对")
@RestController
@RequestMapping("/api/v1/m/payments")
public class MerchantPaymentController {

    private final PayService payService;
    private final OrderMapper orderMapper;

    public MerchantPaymentController(PayService payService, OrderMapper orderMapper) {
        this.payService = payService;
        this.orderMapper = orderMapper;
    }

    @Operation(summary = "待人工核对的支付单：本地已关闭、渠道超过 1 天仍无法确认")
    @PreAuthorize("hasRole('OWNER')")
    @GetMapping("/unconfirmed")
    public Result<List<UnconfirmedPaymentView>> unconfirmed() {
        List<Payment> list = payService.unconfirmedClosedOlderThan(OffsetDateTime.now().minusDays(1));
        if (list.isEmpty()) {
            return Result.ok(List.of());
        }
        // orders 是租户表：只会取到本店订单，其他店的支付单自然被过滤掉
        Map<Long, Order> orders = orderMapper.selectBatchIds(list.stream().map(Payment::getOrderId).toList())
                .stream().collect(Collectors.toMap(Order::getId, Function.identity()));
        return Result.ok(list.stream()
                .filter(p -> orders.containsKey(p.getOrderId()))
                .map(p -> new UnconfirmedPaymentView(p.getOutTradeNo(), orders.get(p.getOrderId()).getOrderNo(), p.getChannel(),
                        p.getAmount(), p.getCreatedAt(), p.getUpdatedAt()))
                .toList());
    }
}
