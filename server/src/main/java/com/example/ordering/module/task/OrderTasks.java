package com.example.ordering.module.task;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.CustomerOrderService;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 订单 / 退款定时任务（设计文档 §2.6，单实例 @Scheduled）。
 * 每个订单单独处理并捕获异常，避免一条数据阻塞整批；状态变更均为条件更新，重复执行安全。
 */
@Slf4j
@Component
public class OrderTasks {

    private final OrderMapper orderMapper;
    private final CustomerOrderService customerOrderService;
    private final OrderStateService orderStateService;
    private final RefundService refundService;
    private final StoreService storeService;
    private final TransactionTemplate tx;
    private final Duration refundQueryAfter;

    public OrderTasks(OrderMapper orderMapper, CustomerOrderService customerOrderService, OrderStateService orderStateService,
                      RefundService refundService, StoreService storeService,
                      TransactionTemplate tx, AppProperties appProperties) {
        this.orderMapper = orderMapper;
        this.customerOrderService = customerOrderService;
        this.orderStateService = orderStateService;
        this.refundService = refundService;
        this.storeService = storeService;
        this.tx = tx;
        this.refundQueryAfter = appProperties.getRefund().getQueryAfter();
    }

    /** 未支付关单：每分钟。余额支付在发起时即同步完成，待支付订单不会有「已付款但未入账」的情况 */
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void closeExpiredOrders() {
        List<Order> expired = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.PENDING_PAY)
                .lt(Order::getPayExpireAt, OffsetDateTime.now())
                .orderByAsc(Order::getId)
                .last("LIMIT 200"));
        for (Order order : expired) {
            try {
                customerOrderService.closeExpired(order, "支付超时自动关闭");
            } catch (RuntimeException e) {
                log.error("关单任务处理订单 {} 失败", order.getOrderNo(), e);
            }
        }
    }

    /** 未接单自动退款：每分钟。手动接单模式下，已支付超过店铺配置时长未接单 → 取消 + 全额退款 */
    @Scheduled(fixedDelay = 60_000, initialDelay = 45_000)
    public void autoRefundUnaccepted() {
        // 超时判断放在 SQL 里（按各店的接单时限）：只取前 200 单再在内存里过滤，
        // 会被时限较长门店的订单占满名额，导致其他门店早已超时的订单一直轮不到
        List<Order> paid = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.PAID)
                .isNotNull(Order::getPaidAt)
                .apply("paid_at < now() - make_interval(mins => COALESCE("
                        + "(SELECT s.accept_timeout_min FROM store s WHERE s.id = orders.store_id), 10))")
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

    /** 退款结果补偿：每 5 分钟，处理中超过 N 分钟的退款单按钱包流水查询，未返还则重新提交 */
    @Scheduled(fixedDelay = 300_000, initialDelay = 90_000)
    public void compensateRefunds() {
        List<Refund> processing = refundService.processingOlderThan(OffsetDateTime.now().minus(refundQueryAfter));
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
