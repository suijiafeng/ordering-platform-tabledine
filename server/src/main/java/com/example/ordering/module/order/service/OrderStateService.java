package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.menu.entity.Dish;
import com.example.ordering.module.menu.mapper.DishMapper;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.OrderStatusLog;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.mapper.OrderStatusLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 订单状态流转的底层操作：条件更新（WHERE status = 原状态）保证并发安全，每次变更写 order_status_log。
 * 不含任何渠道调用，供 OrderService / MerchantOrderService / PayService / RefundService / 定时任务复用。
 * <p>
 * 注意：商家端请求带门店上下文，多租户插件会给 orders 的更新自动追加 store_id 条件；
 * 顾客端 / 定时任务 / 回调无门店上下文，调用方须自行校验归属。
 */
@Slf4j
@Service
public class OrderStateService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final OrderStatusLogMapper logMapper;
    private final DishMapper dishMapper;

    public OrderStateService(OrderMapper orderMapper, OrderItemMapper orderItemMapper,
                             OrderStatusLogMapper logMapper, DishMapper dishMapper) {
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.logMapper = logMapper;
        this.dishMapper = dishMapper;
    }

    // ==================== 查询 ====================

    public Order getByNo(String orderNo) {
        Order order = StringUtils.hasText(orderNo)
                ? orderMapper.selectOne(Wrappers.<Order>lambdaQuery().eq(Order::getOrderNo, orderNo))
                : null;
        if (order == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        }
        return order;
    }

    public Order getById(Long id) {
        Order order = orderMapper.selectById(id);
        if (order == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        }
        return order;
    }

    public List<OrderItem> items(Long orderId) {
        return orderItemMapper.selectList(Wrappers.<OrderItem>lambdaQuery()
                .eq(OrderItem::getOrderId, orderId).orderByAsc(OrderItem::getId));
    }

    public List<OrderStatusLog> logs(Long orderId) {
        return logMapper.selectList(Wrappers.<OrderStatusLog>lambdaQuery()
                .eq(OrderStatusLog::getOrderId, orderId).orderByAsc(OrderStatusLog::getId));
    }

    // ==================== 状态流转 ====================

    /**
     * 条件状态流转：仅当订单当前状态为 from 时更新为 to，并写日志。
     *
     * @return true 更新成功；false 状态已被并发修改（调用方决定是否视为冲突）
     */
    @Transactional
    public boolean transition(Order order, OrderStatus from, OrderStatus to, OperatorType operatorType,
                              Long operatorId, String remark) {
        OffsetDateTime now = OffsetDateTime.now();
        LambdaUpdateWrapper<Order> update = Wrappers.<Order>lambdaUpdate()
                .set(Order::getStatus, to)
                .set(Order::getUpdatedAt, now)
                .setSql("version = version + 1")
                .eq(Order::getId, order.getId())
                .eq(Order::getStatus, from);
        switch (to) {
            case PAID -> update.set(Order::getPaidAt, order.getPaidAt() != null ? order.getPaidAt() : now);
            case MAKING -> {
                update.set(Order::getAcceptedAt, now);
                if (from == OrderStatus.PENDING_PAY) {
                    // 自动接单：支付成功直接进入制作中，同时记录支付时间
                    update.set(Order::getPaidAt, order.getPaidAt() != null ? order.getPaidAt() : now);
                }
            }
            case READY -> update.set(Order::getReadyAt, now);
            case DONE -> update.set(Order::getDoneAt, now);
            case CLOSED, CANCELLED -> update.set(Order::getCancelledAt, now).set(Order::getCancelReason, remark);
            default -> { }
        }
        int rows = orderMapper.update(null, update);
        if (rows == 0) {
            log.info("订单 {} 状态流转 {}→{} 未生效（当前状态已变化）", order.getOrderNo(), from, to);
            return false;
        }
        log(order.getId(), from, to, operatorType, operatorId, remark);
        // 同步内存对象，便于调用方继续使用
        order.setStatus(to);
        order.setUpdatedAt(now);
        switch (to) {
            case PAID -> {
                if (order.getPaidAt() == null) {
                    order.setPaidAt(now);
                }
            }
            case MAKING -> {
                order.setAcceptedAt(now);
                if (order.getPaidAt() == null) {
                    order.setPaidAt(now);
                }
            }
            case READY -> order.setReadyAt(now);
            case DONE -> order.setDoneAt(now);
            case CLOSED, CANCELLED -> {
                order.setCancelledAt(now);
                order.setCancelReason(remark);
            }
            default -> { }
        }
        return true;
    }

    /** 流转失败即抛 40901 */
    public void transitionOrConflict(Order order, OrderStatus from, OrderStatus to, OperatorType operatorType,
                                     Long operatorId, String remark) {
        if (!transition(order, from, to, operatorType, operatorId, remark)) {
            throw new BusinessException(ErrorCode.CONFLICT, "订单状态已变化，请刷新后重试");
        }
    }

    public void log(Long orderId, OrderStatus from, OrderStatus to, OperatorType operatorType, Long operatorId, String remark) {
        OrderStatusLog entry = new OrderStatusLog();
        entry.setOrderId(orderId);
        entry.setFromStatus(from);
        entry.setToStatus(to);
        entry.setOperatorType(operatorType);
        entry.setOperatorId(operatorId);
        entry.setRemark(remark);
        logMapper.insert(entry);
    }

    // ==================== 每日限量库存 ====================

    /** 扣减库存（仅对启用限量的菜品生效）；库存不足返回 false */
    public boolean deductStock(Long dishId, int quantity) {
        int rows = dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                .setSql("stock_quantity = stock_quantity - " + quantity)
                .eq(Dish::getId, dishId)
                .isNotNull(Dish::getStockQuantity)
                .ge(Dish::getStockQuantity, quantity));
        if (rows > 0) {
            return true;
        }
        // 未启用限量的菜品不需要扣减：区分「不限量」与「库存不足」
        Dish dish = dishMapper.selectById(dishId);
        return dish != null && dish.getStockQuantity() == null;
    }

    /**
     * 回补库存：未支付关闭、待接单阶段取消时调用；已开始制作后的退款不回补。
     * 只回补到订单所属业务日期的库存：昨天的订单今天取消，占用的是昨天的限量，不能把今天的剩余加回去。
     */
    public void restoreStock(Long orderId) {
        Order order = getById(orderId);
        if (order == null || order.getCreatedAt() == null) {
            return;
        }
        java.time.LocalDate orderDay = order.getCreatedAt().atZoneSameInstant(java.time.ZoneId.of("Asia/Shanghai")).toLocalDate();
        for (OrderItem item : items(orderId)) {
            dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                    .setSql("stock_quantity = LEAST(stock_quantity + " + item.getQuantity() + ", daily_stock)")
                    .eq(Dish::getId, item.getDishId())
                    .eq(Dish::getStockDate, orderDay)
                    .isNotNull(Dish::getStockQuantity)
                    .isNotNull(Dish::getDailyStock));
        }
    }
}
