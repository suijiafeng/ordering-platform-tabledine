package com.example.ordering.module.refund.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.mapper.OrderItemMapper;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundItem;
import com.example.ordering.module.refund.mapper.RefundItemMapper;
import com.example.ordering.module.staff.service.StaffDirectory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 退款单 → 视图（附菜品明细、操作员工姓名）。只读，批量查询避免 N+1 */
@Component
public class RefundViewAssembler {

    private final RefundItemMapper refundItemMapper;
    private final OrderItemMapper orderItemMapper;
    private final StaffDirectory staffDirectory;

    public RefundViewAssembler(RefundItemMapper refundItemMapper, OrderItemMapper orderItemMapper, StaffDirectory staffDirectory) {
        this.refundItemMapper = refundItemMapper;
        this.orderItemMapper = orderItemMapper;
        this.staffDirectory = staffDirectory;
    }

    public RefundView view(Refund refund, Order order) {
        return views(List.of(refund), Map.of(order.getId(), order)).get(0);
    }

    /** @param ordersById 退款所属订单（用于订单号、桌号） */
    public List<RefundView> views(List<Refund> refunds, Map<Long, Order> ordersById) {
        if (refunds.isEmpty()) {
            return List.of();
        }
        List<Long> refundIds = refunds.stream().map(Refund::getId).toList();
        Map<Long, List<RefundItem>> itemsByRefund = refundItemMapper.selectList(Wrappers.<RefundItem>lambdaQuery()
                        .in(RefundItem::getRefundId, refundIds)).stream()
                .collect(Collectors.groupingBy(RefundItem::getRefundId));
        List<Long> orderItemIds = itemsByRefund.values().stream().flatMap(Collection::stream)
                .map(RefundItem::getOrderItemId).distinct().toList();
        Map<Long, OrderItem> orderItems = orderItemIds.isEmpty() ? Map.of()
                : orderItemMapper.selectBatchIds(orderItemIds).stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
        Map<Long, String> staffNames = staffDirectory.namesOf(
                refunds.stream().map(Refund::getOperatorId).filter(Objects::nonNull).distinct().toList());

        List<RefundView> result = new ArrayList<>();
        for (Refund refund : refunds) {
            Order order = ordersById.get(refund.getOrderId());
            List<RefundView.RefundItemView> items = itemsByRefund.getOrDefault(refund.getId(), List.of()).stream()
                    .map(refundItem -> {
                        OrderItem orderItem = orderItems.get(refundItem.getOrderItemId());
                        return new RefundView.RefundItemView(refundItem.getOrderItemId(),
                                orderItem == null ? "-" : orderItem.getDishName(), orderItem == null ? null : orderItem.getSpecDesc(),
                                refundItem.getQuantity(), refundItem.getAmount());
                    }).toList();
            result.add(new RefundView(refund.getId(), refund.getRefundNo(), order == null ? null : order.getOrderNo(),
                    order == null ? null : order.getTableCode(), refund.getType(), refund.getInitiator(), refund.getAmount(),
                    refund.getReason(), refund.getRejectReason(), refund.getStatus(), refund.getFailReason(), refund.getChannelRefundNo(),
                    refund.getOperatorId(), staffNames.get(refund.getOperatorId()), refund.getCreatedAt(), refund.getSuccessAt(), items));
        }
        return result;
    }
}
