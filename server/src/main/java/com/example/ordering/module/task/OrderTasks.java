package com.example.ordering.module.task;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.CustomerOrderService;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 订单 / 支付 / 退款定时任务（设计文档 §2.6，单实例 @Scheduled）。
 * 每个订单单独处理并捕获异常，避免一条数据阻塞整批；状态变更均为条件更新，重复执行安全。
 */
@Slf4j
@Component
public class OrderTasks {

    private final OrderMapper orderMapper;
    private final CustomerOrderService customerOrderService;
    private final OrderStateService orderStateService;
    private final PayService payService;
    private final RefundService refundService;
    private final StoreService storeService;
    private final TransactionTemplate tx;
    private final AppProperties.Pay payProps;

    public OrderTasks(OrderMapper orderMapper, CustomerOrderService customerOrderService, OrderStateService orderStateService,
                      PayService payService, RefundService refundService, StoreService storeService,
                      TransactionTemplate tx, AppProperties appProperties) {
        this.orderMapper = orderMapper;
        this.customerOrderService = customerOrderService;
        this.orderStateService = orderStateService;
        this.payService = payService;
        this.refundService = refundService;
        this.storeService = storeService;
        this.tx = tx;
        this.payProps = appProperties.getPay();
    }

    /** 未支付关单：每分钟。先向渠道查一次，避免把刚支付成功但回调未到的订单关掉 */
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void closeExpiredOrders() {
        List<Order> expired = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.PENDING_PAY)
                .lt(Order::getPayExpireAt, OffsetDateTime.now())
                .orderByAsc(Order::getId)
                .last("LIMIT 200"));
        for (Order order : expired) {
            try {
                PayService.PayCheck check = payService.queryAndSync(order);
                if (check == PayService.PayCheck.PAID) {
                    continue;  // 查到已支付，已入账
                }
                if (check == PayService.PayCheck.UNKNOWN) {
                    // 渠道查询失败：无法确认没付，本轮不关单，下一轮再查（否则已付款订单会被关掉再退款）
                    log.warn("订单 {} 查单结果未确认，暂不关单", order.getOrderNo());
                    continue;
                }
                customerOrderService.closeExpired(order, "支付超时自动关闭");
            } catch (RuntimeException e) {
                log.error("关单任务处理订单 {} 失败", order.getOrderNo(), e);
            }
        }
    }

    /** 未接单自动退款：每分钟。手动接单模式下，已支付超过店铺配置时长未接单 → 取消 + 全额退款 */
    @Scheduled(fixedDelay = 60_000, initialDelay = 45_000)
    public void autoRefundUnaccepted() {
        List<Order> paid = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.PAID)
                .lt(Order::getPaidAt, OffsetDateTime.now().minusMinutes(1))
                .orderByAsc(Order::getId)
                .last("LIMIT 200"));
        Map<Long, Store> stores = new HashMap<>();
        for (Order order : paid) {
            try {
                Store store = stores.computeIfAbsent(order.getStoreId(), storeService::getRequired);
                int timeout = store.getAcceptTimeoutMin() == null ? 10 : store.getAcceptTimeoutMin();
                if (order.getPaidAt() == null || order.getPaidAt().plusMinutes(timeout).isAfter(OffsetDateTime.now())) {
                    continue;
                }
                String remark = "超过 " + timeout + " 分钟未接单，自动取消并退款";
                tx.executeWithoutResult(s -> {
                    if (orderStateService.transition(order, OrderStatus.PAID, OrderStatus.CANCELLED, OperatorType.SYSTEM, null, remark)) {
                        orderStateService.restoreStock(order.getId());
                        refundService.refundOrder(order, RefundInitiator.SYSTEM, null, remark);
                        log.warn("订单 {} 超时未接单，已自动取消并发起退款", order.getOrderNo());
                    }
                });
            } catch (RuntimeException e) {
                log.error("自动退款任务处理订单 {} 失败", order.getOrderNo(), e);
            }
        }
    }

    /** 支付结果补偿查单：每 5 分钟，对创建一段时间后仍待支付的订单主动查单 */
    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    public void compensatePayments() {
        List<Order> pending = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.PENDING_PAY)
                .lt(Order::getCreatedAt, OffsetDateTime.now().minus(payProps.getPayQueryAfter()))
                .orderByAsc(Order::getId)
                .last("LIMIT 200"));
        for (Order order : pending) {
            try {
                payService.queryAndSync(order);
            } catch (RuntimeException e) {
                log.error("查单补偿处理订单 {} 失败", order.getOrderNo(), e);
            }
        }
        // 本地已关闭但渠道未确认的支付单：关单与付款同时发生、渠道关单失败、回调丢失时，付款只能从这里找回
        payService.reconcileUnconfirmedClosed(OffsetDateTime.now().minusDays(3), 200);
    }

    /** 退款结果补偿：每 5 分钟，处理中超过 N 分钟的退款单主动查询 */
    @Scheduled(fixedDelay = 300_000, initialDelay = 90_000)
    public void compensateRefunds() {
        List<Refund> processing = refundService.processingOlderThan(OffsetDateTime.now().minus(payProps.getRefundQueryAfter()));
        for (Refund refund : processing) {
            try {
                refundService.queryAndSync(refund);
            } catch (RuntimeException e) {
                log.error("退款补偿处理 {} 失败", refund.getRefundNo(), e);
            }
        }
    }

    /** 待审核退款提醒：每 10 分钟，申请超过 2 小时未处理的记录告警日志（商家端轮询 applyingRefundCount 展示红点） */
    @Scheduled(fixedDelay = 600_000, initialDelay = 120_000)
    public void remindApplyingRefunds() {
        List<Refund> overdue = refundService.applyingOlderThan(OffsetDateTime.now().minusHours(2));
        if (!overdue.isEmpty()) {
            log.warn("有 {} 笔退款申请超过 2 小时未审核，请店主尽快处理: {}", overdue.size(),
                    overdue.stream().map(Refund::getRefundNo).toList());
        }
    }
}
