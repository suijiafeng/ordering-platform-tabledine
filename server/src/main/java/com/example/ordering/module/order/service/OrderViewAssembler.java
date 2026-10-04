package com.example.ordering.module.order.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.dto.OrderItemView;
import com.example.ordering.module.order.dto.OrderStatusLogView;
import com.example.ordering.module.order.dto.OrderSummary;
import com.example.ordering.module.order.dto.PaymentView;
import com.example.ordering.module.order.entity.OperatorType;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.entity.OrderStatusLog;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.pay.entity.Payment;
import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** 订单视图组装（列表 / 详情），顾客端与商家端共用 */
@Component
public class OrderViewAssembler {

    private final OrderStateService orderStateService;
    private final OrderItemMapper orderItemMapper;
    private final PayService payService;
    private final RefundService refundService;
    private final StoreService storeService;

    public OrderViewAssembler(OrderStateService orderStateService, OrderItemMapper orderItemMapper,
                              PayService payService, RefundService refundService, StoreService storeService) {
        this.orderStateService = orderStateService;
        this.orderItemMapper = orderItemMapper;
        this.payService = payService;
        this.refundService = refundService;
        this.storeService = storeService;
    }

    public List<OrderSummary> summaries(List<Order> orders) {
        if (orders.isEmpty()) {
            return List.of();
        }
        List<Long> ids = orders.stream().map(Order::getId).toList();
        Map<Long, List<OrderItem>> itemsByOrder = orderItemMapper.selectList(Wrappers.<OrderItem>lambdaQuery()
                        .in(OrderItem::getOrderId, ids).orderByAsc(OrderItem::getId)).stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId, LinkedHashMap::new, Collectors.toList()));
        List<OrderSummary> result = new ArrayList<>();
        for (Order o : orders) {
            List<OrderItem> items = itemsByOrder.getOrDefault(o.getId(), List.of());
            int count = items.stream().mapToInt(OrderItem::getQuantity).sum();
            result.add(new OrderSummary(o.getId(), o.getOrderNo(), o.getStatus(), o.getRefundStatus(), o.getTableCode(),
                    o.getPlatform(), o.getTotalAmount(), o.getPayAmount(), nz(o.getRefundedAmount()),
                    o.getPeopleCount() == null ? 1 : o.getPeopleCount(), o.getRemark(), count,
                    items.stream().map(OrderItemView::of).toList(),
                    o.getCreatedAt(), o.getPayExpireAt(), o.getPaidAt(), o.getAcceptedAt(), o.getReadyAt()));
        }
        return result;
    }

    /**
     * @param customerView true 时计算顾客端的操作可用性（canCancel / canApplyRefund）
     */
    public OrderDetail detail(Order order, boolean customerView) {
        List<OrderItem> items = orderStateService.items(order.getId());
        Payment payment = payService.latestPayment(order.getId());
        List<RefundView> refunds = refundService.listByOrder(order);
        List<OrderStatusLog> logs = orderStateService.logs(order.getId());
        Map<Long, String> staffNames = refundService.staffNames(logs.stream()
                .filter(l -> l.getOperatorType() == OperatorType.MERCHANT && l.getOperatorId() != null)
                .map(OrderStatusLog::getOperatorId).distinct().toList());
        Store store = storeService.getRequired(order.getStoreId());

        boolean canCancel = customerView && (order.getStatus() == OrderStatus.PENDING_PAY || order.getStatus() == OrderStatus.PAID);
        boolean canApplyRefund = customerView && refundService.canCustomerApply(order);

        return new OrderDetail(order.getId(), order.getOrderNo(), order.getStatus(), order.getRefundStatus(),
                order.getStoreId(), store.getName(), order.getTableId(), order.getTableCode(), order.getPlatform(),
                order.getTotalAmount(), order.getPayAmount(), nz(order.getRefundedAmount()), order.refundableAmount(),
                order.getPeopleCount() == null ? 1 : order.getPeopleCount(), order.getRemark(),
                order.getPayExpireAt(), order.getPaidAt(), order.getAcceptedAt(), order.getReadyAt(),
                order.getDoneAt(), order.getCancelledAt(), order.getCancelReason(), order.getCreatedAt(),
                items.stream().map(OrderItemView::of).toList(),
                payment == null ? null : PaymentView.of(payment),
                refunds,
                logs.stream().map(l -> new OrderStatusLogView(l.getFromStatus(), l.getToStatus(), l.getOperatorType(),
                        l.getOperatorId(), l.getOperatorId() == null ? null : staffNames.get(l.getOperatorId()), l.getRemark(), l.getCreatedAt())).toList(),
                canCancel, canApplyRefund);
    }

    private static long nz(Long v) {
        return v == null ? 0 : v;
    }
}
