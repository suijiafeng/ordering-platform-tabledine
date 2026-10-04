package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.order.dto.NewOrderCount;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundInitiator;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.mapper.RefundMapper;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.security.LoginUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * 商家端订单：列表 / 详情 / 履约流转 / 拒单 / 整单取消 / 新订单轮询。
 * 所有查询经多租户插件自动限定当前门店。
 */
@Service
public class MerchantOrderService {

    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final OrderMapper orderMapper;
    private final RefundMapper refundMapper;
    private final OrderStateService orderStateService;
    private final OrderViewAssembler assembler;
    private final RefundService refundService;

    public MerchantOrderService(OrderMapper orderMapper, RefundMapper refundMapper, OrderStateService orderStateService,
                                OrderViewAssembler assembler, RefundService refundService) {
        this.orderMapper = orderMapper;
        this.refundMapper = refundMapper;
        this.orderStateService = orderStateService;
        this.assembler = assembler;
        this.refundService = refundService;
    }

    // ==================== 查询 ====================

    /**
     * @param status  逗号分隔的状态列表，空 = 全部
     * @param keyword 订单号 / 桌号模糊匹配
     * @param date    yyyy-MM-dd，按下单日期过滤（空 = 不限）
     */
    public PageResult<OrderSummary> list(String status, String keyword, String date, int page, int pageSize) {
        LambdaQueryWrapper<Order> query = Wrappers.<Order>lambdaQuery();
        List<OrderStatus> statuses = parseStatuses(status);
        if (!statuses.isEmpty()) {
            query.in(Order::getStatus, statuses);
        }
        if (StringUtils.hasText(keyword)) {
            String k = keyword.trim();
            query.and(w -> w.like(Order::getOrderNo, k).or().like(Order::getTableCode, k));
        }
        if (StringUtils.hasText(date)) {
            LocalDate d = LocalDate.parse(date.trim());
            OffsetDateTime from = d.atStartOfDay(CN).toOffsetDateTime();
            query.ge(Order::getCreatedAt, from).lt(Order::getCreatedAt, from.plusDays(1));
        }
        query.orderByDesc(Order::getId);
        Page<Order> result = orderMapper.selectPage(new Page<>(page, pageSize), query);
        return new PageResult<>(assembler.summaries(result.getRecords()), result.getTotal(), result.getCurrent(), result.getSize());
    }

    /** 后厨队列：待制作（已支付待接单）+ 制作中，按支付时间升序 */
    public List<OrderSummary> kitchenQueue() {
        List<Order> orders = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .in(Order::getStatus, OrderStatus.PAID, OrderStatus.MAKING, OrderStatus.READY)
                .orderByAsc(Order::getPaidAt, Order::getId)
                .last("LIMIT 200"));
        return assembler.summaries(orders);
    }

    public OrderDetail detail(String orderNo) {
        return assembler.merchantDetail(orderStateService.getByNo(orderNo));
    }

    /** 轮询：since 之后新支付的订单数 + 待处理数量 */
    public NewOrderCount newCount(OffsetDateTime since) {
        OffsetDateTime now = OffsetDateTime.now();
        long newPaid = since == null ? 0 : orderMapper.selectCount(Wrappers.<Order>lambdaQuery()
                .in(Order::getStatus, OrderStatus.PAID, OrderStatus.MAKING, OrderStatus.READY, OrderStatus.DONE, OrderStatus.CANCELLED)
                .gt(Order::getPaidAt, since));
        List<String> pendingNos = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                        .select(Order::getOrderNo).eq(Order::getStatus, OrderStatus.PAID).orderByAsc(Order::getId).last("LIMIT 500"))
                .stream().map(Order::getOrderNo).toList();
        long pendingAccept = pendingNos.size();
        long making = orderMapper.selectCount(Wrappers.<Order>lambdaQuery().eq(Order::getStatus, OrderStatus.MAKING));
        long applying = refundMapper.selectCount(Wrappers.<Refund>lambdaQuery().eq(Refund::getStatus, RefundStatus.APPLYING));
        long failed = refundMapper.selectCount(Wrappers.<Refund>lambdaQuery().eq(Refund::getStatus, RefundStatus.FAILED));
        return new NewOrderCount(newPaid, pendingAccept, making, applying, failed, now, pendingNos);
    }

    // ==================== 履约流转 ====================

    public OrderDetail accept(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.MAKING, OperatorType.MERCHANT, staff.id(), "商家接单");
        return assembler.merchantDetail(order);
    }

    /** 拒单：待接单 → 已取消 + 全额退款 + 回补库存（店员可操作） */
    @Transactional
    public OrderDetail reject(String orderNo, String reason) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        String remark = StringUtils.hasText(reason) ? "商家拒单：" + reason.trim() : "商家拒单";
        orderStateService.transitionOrConflict(order, OrderStatus.PAID, OrderStatus.CANCELLED, OperatorType.MERCHANT, staff.id(), remark);
        orderStateService.restoreStock(order.getId());
        refundService.refundOrder(order, RefundInitiator.MERCHANT, staff.id(), remark);
        return assembler.merchantDetail(order);
    }

    public OrderDetail ready(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        orderStateService.transitionOrConflict(order, OrderStatus.MAKING, OrderStatus.READY, OperatorType.MERCHANT, staff.id(), "出餐完成");
        return assembler.merchantDetail(order);
    }

    public OrderDetail deliver(String orderNo) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        orderStateService.transitionOrConflict(order, OrderStatus.READY, OrderStatus.DONE, OperatorType.MERCHANT, staff.id(), "已送达");
        return assembler.merchantDetail(order);
    }

    /** 整单取消（店主）：制作中 / 待送餐 → 已取消 + 全额退款；已开始制作不回补库存 */
    @Transactional
    public OrderDetail cancel(String orderNo, String reason) {
        Order order = orderStateService.getByNo(orderNo);
        LoginUser staff = LoginUser.currentStaff();
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "请填写取消原因");
        }
        String remark = "商家取消：" + reason.trim();
        OrderStatus from = order.getStatus();
        if (from == OrderStatus.PAID) {
            return reject(orderNo, reason);
        }
        if (from != OrderStatus.MAKING && from != OrderStatus.READY) {
            throw new BusinessException(ErrorCode.CONFLICT, "当前状态不能整单取消");
        }
        orderStateService.transitionOrConflict(order, from, OrderStatus.CANCELLED, OperatorType.MERCHANT, staff.id(), remark);
        refundService.refundOrder(order, RefundInitiator.MERCHANT, staff.id(), remark);
        return assembler.merchantDetail(order);
    }

    /** 商家主动退款 */
    public RefundView refund(String orderNo, MerchantRefundRequest req) {
        Order order = orderStateService.getByNo(orderNo);
        return refundService.merchantInitiate(order, req, LoginUser.currentStaff());
    }

    private static List<OrderStatus> parseStatuses(String status) {
        List<OrderStatus> list = new ArrayList<>();
        if (!StringUtils.hasText(status)) {
            return list;
        }
        for (String s : status.split(",")) {
            try {
                list.add(OrderStatus.valueOf(s.trim()));
            } catch (IllegalArgumentException ignored) {
                // 忽略非法值
            }
        }
        return list;
    }
}
