package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.module.order.dto.MerchantCreateOrderRequest;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.SettleRequest;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.RefundStatusOfOrder;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.pay.entity.OfflinePayMethod;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.entity.PaymentStatus;
import com.example.ordering.module.pay.mapper.PaymentMapper;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.module.table.entity.DiningTable;
import com.example.ordering.module.table.mapper.DiningTableMapper;
import com.example.ordering.security.LoginUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;

/**
 * 前厅代客下单 + 线下收款登记（记账）。
 * 顾客不扫码（老人、没带手机、电话点单等），前厅在后台选桌下单，当面收款后登记收款方式；
 * 订单没有顾客账号，前厅下的单视为已确认，直接进入后厨「待制作」。退款同样线下退还（见 RefundService）。
 */
@Service
public class MerchantPlaceOrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final PaymentMapper paymentMapper;
    private final DiningTableMapper tableMapper;
    private final StoreService storeService;
    private final CustomerOrderService customerOrderService;
    private final OrderStateService orderStateService;
    private final OrderViewAssembler assembler;
    private final TransactionTemplate tx;

    public MerchantPlaceOrderService(OrderMapper orderMapper, OrderItemMapper orderItemMapper, PaymentMapper paymentMapper,
                                     DiningTableMapper tableMapper, StoreService storeService, CustomerOrderService customerOrderService,
                                     OrderStateService orderStateService, OrderViewAssembler assembler, TransactionTemplate tx) {
        this.orderMapper = orderMapper;
        this.orderItemMapper = orderItemMapper;
        this.paymentMapper = paymentMapper;
        this.tableMapper = tableMapper;
        this.storeService = storeService;
        this.customerOrderService = customerOrderService;
        this.orderStateService = orderStateService;
        this.assembler = assembler;
        this.tx = tx;
    }

    public OrderDetail create(MerchantCreateOrderRequest req) {
        LoginUser staff = LoginUser.currentStaff();
        // 防重复提交（网络重试、连点）：同一门店同一请求号返回已创建的订单
        Order existing = findByClientRequest(staff.storeId(), req.clientRequestId());
        if (existing != null) {
            return assembler.merchantDetail(existing);
        }
        try {
            Order order = tx.execute(status -> doCreate(staff, req));
            return assembler.merchantDetail(order);
        } catch (DuplicateKeyException e) {
            Order order = findByClientRequest(staff.storeId(), req.clientRequestId());
            if (order != null) {
                return assembler.merchantDetail(order);
            }
            throw e;
        }
    }

    private Order findByClientRequest(Long storeId, String clientRequestId) {
        return orderMapper.selectOne(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStoreId, storeId)
                .isNull(Order::getCustomerId)
                .eq(Order::getClientRequestId, clientRequestId));
    }

    private Order doCreate(LoginUser staff, MerchantCreateOrderRequest req) {
        DiningTable table = tableMapper.selectById(req.tableId());
        if (table == null || !staff.storeId().equals(table.getStoreId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "桌台不存在");
        }
        if (table.getStatus() == null || table.getStatus() != DiningTable.STATUS_ENABLED) {
            throw new BusinessException(ErrorCode.CONFLICT, "桌台 " + table.getCode() + " 已停用");
        }
        Store store = storeService.getRequired(table.getStoreId());
        if (!store.isOpen()) {
            throw new BusinessException(ErrorCode.STORE_CLOSED);
        }

        String payMode = Order.PAY_LATER.equals(req.payMode()) ? Order.PAY_LATER : Order.PAY_FIRST;
        if (Order.PAY_FIRST.equals(payMode) && !StringUtils.hasText(req.payMethod())) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "先付后吃请选择收款方式");
        }

        // 与顾客下单同一套校验、计价与限量库存扣减
        CustomerOrderService.PreparedItems prepared = customerOrderService.prepareItems(store, req.items());
        OffsetDateTime now = OffsetDateTime.now();

        Order order = new Order();
        order.setOrderNo(OrderNoGenerator.orderNo());
        order.setClientRequestId(req.clientRequestId());
        order.setStoreId(store.getId());
        order.setTableId(table.getId());
        order.setTableCode(table.getCode());
        order.setCustomerId(null);
        order.setSource(Order.SOURCE_MERCHANT);
        order.setCreatedByStaffId(staff.id());
        order.setPlatform(Platform.OFFLINE);
        order.setPayMode(payMode);
        if (Order.PAY_LATER.equals(payMode)) {
            // 先吃后付：不收款，直接进入后厨「待制作」；paid_at 留空，结账时才入账
            order.setStatus(OrderStatus.MAKING);
            order.setAcceptedAt(now);
        } else {
            order.setStatus(OrderStatus.PENDING_PAY);
        }
        order.setRefundStatus(RefundStatusOfOrder.NONE);
        order.setTotalAmount(prepared.total());
        order.setPayAmount(prepared.total());
        order.setRefundedAmount(0L);
        order.setPeopleCount(req.peopleCount() == null ? 1 : req.peopleCount());
        order.setRemark(StringUtils.hasText(req.remark()) ? req.remark().trim() : null);
        order.setPayExpireAt(now);
        order.setVersion(0);
        orderMapper.insert(order);
        for (OrderItem item : prepared.items()) {
            item.setOrderId(order.getId());
            item.setRefundedQty(0);
            orderItemMapper.insert(item);
        }
        if (Order.PAY_LATER.equals(payMode)) {
            orderStateService.log(order.getId(), null, OrderStatus.MAKING, OperatorType.MERCHANT, staff.id(), "前厅代客下单（先吃后付，离店结账）");
            return order;
        }
        orderStateService.log(order.getId(), null, OrderStatus.PENDING_PAY, OperatorType.MERCHANT, staff.id(), "前厅代客下单");

        // 记账：登记线下收款（现金 / 转账等），钱不经过系统
        String method = OfflinePayMethod.label(req.payMethod());
        insertOfflinePayment(order, req.payMethod(), req.payRemark(), staff.id(), now);

        // 前厅下的单视为已确认：直接进入后厨「待制作」
        orderStateService.transitionOrConflict(order, OrderStatus.PENDING_PAY, OrderStatus.MAKING, OperatorType.MERCHANT, staff.id(),
                String.format("前厅代客下单，线下收款（%s）¥%.2f", method, prepared.total() / 100.0));
        return order;
    }

    private void insertOfflinePayment(Order order, String payMethod, String payRemark, Long staffId, OffsetDateTime paidAt) {
        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setOutTradeNo(order.getOrderNo());
        payment.setChannel(Platform.OFFLINE);
        payment.setTransactionNo("OFF" + order.getOrderNo());
        payment.setAmount(order.getPayAmount());
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(paidAt);
        payment.setRefundedAmount(0L);
        payment.setPayMethod(payMethod);
        payment.setOperatorId(staffId);
        payment.setRemark(StringUtils.hasText(payRemark) ? payRemark.trim() : null);
        paymentMapper.insert(payment);
    }

    /**
     * 先吃后付结账：登记线下收款，订单此刻才入账（paid_at = 结账时间，计入当天实收）。
     * 订单状态不变（可能还在制作，也可能已送达）；条件更新保证同一单只能结一次。
     */
    public OrderDetail settle(String orderNo, SettleRequest req) {
        LoginUser staff = LoginUser.currentStaff();
        Order result = tx.execute(st -> {
            Order order = orderStateService.getByNo(orderNo);
            if (!Order.PAY_LATER.equals(order.getPayMode())) {
                throw new BusinessException(ErrorCode.CONFLICT, "该订单下单时已付款，无需结账");
            }
            if (order.getStatus() == OrderStatus.CANCELLED || order.getStatus() == OrderStatus.CLOSED) {
                throw new BusinessException(ErrorCode.CONFLICT, "订单已取消，无需结账");
            }
            OffsetDateTime now = OffsetDateTime.now();
            int updated = orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
                    .set(Order::getPaidAt, now)
                    .set(Order::getUpdatedAt, now)
                    .eq(Order::getId, order.getId())
                    .isNull(Order::getPaidAt)
                    .notIn(Order::getStatus, OrderStatus.CANCELLED, OrderStatus.CLOSED));
            if (updated == 0) {
                throw new BusinessException(ErrorCode.CONFLICT, "该订单已结账或状态已变化，请刷新");
            }
            order.setPaidAt(now);
            insertOfflinePayment(order, req.payMethod(), req.payRemark(), staff.id(), now);
            orderStateService.log(order.getId(), order.getStatus(), order.getStatus(), OperatorType.MERCHANT, staff.id(),
                    String.format("结账：线下收款（%s）¥%.2f", OfflinePayMethod.label(req.payMethod()), order.getPayAmount() / 100.0));
            return order;
        });
        return assembler.merchantDetail(result);
    }
}
