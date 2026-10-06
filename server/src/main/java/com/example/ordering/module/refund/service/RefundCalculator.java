package com.example.ordering.module.refund.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.refund.dto.CustomerRefundRequest;
import com.example.ordering.module.refund.entity.RefundItem;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 退款规则计算：可退数量、退款明细与金额、售后时限。
 * 纯计算，不读写数据库、不涉及事务；输入由调用方查好传入。
 */
@Component
public class RefundCalculator {

    /**
     * 校验按菜品退款的明细并计算金额（单位：分）。同一菜品行出现多次时合并数量。
     *
     * @param orderItems 订单的全部菜品行
     * @param inputs     申请退的菜品行与数量
     * @param out        生成的退款明细（追加到此列表）
     * @return 退款总额（分）= Σ 单价 × 退款数量
     */
    public long buildItems(List<OrderItem> orderItems, List<CustomerRefundRequest.ItemInput> inputs, List<RefundItem> out) {
        Map<Long, OrderItem> byId = orderItems.stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
        Map<Long, Integer> quantityByItem = new LinkedHashMap<>();
        for (CustomerRefundRequest.ItemInput in : inputs) {
            quantityByItem.merge(in.orderItemId(), in.quantity(), Integer::sum);
        }
        long totalAmountInCents = 0;
        for (Map.Entry<Long, Integer> e : quantityByItem.entrySet()) {
            OrderItem item = byId.get(e.getKey());
            if (item == null) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "退款菜品不属于该订单");
            }
            if (e.getValue() > item.refundableQty()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID,
                        "「" + item.getDishName() + "」可退数量不足（可退 " + item.refundableQty() + " 份）");
            }
            RefundItem refundItem = new RefundItem();
            refundItem.setOrderItemId(item.getId());
            refundItem.setQuantity(e.getValue());
            refundItem.setAmount(item.getUnitPrice() * e.getValue());
            out.add(refundItem);
            totalAmountInCents += refundItem.getAmount();
        }
        return totalAmountInCents;
    }

    /**
     * 是否仍在售后申请时限内。只有已完成的订单受时限约束，从送达时间起算（老数据无送达时间时退回下单时间）。
     */
    public boolean withinAfterSaleWindow(Order order, int afterSaleHours) {
        if (order.getStatus() != OrderStatus.DONE) {
            return true;
        }
        OffsetDateTime start = order.getDoneAt() != null ? order.getDoneAt() : order.getCreatedAt();
        return start.plusHours(afterSaleHours).isAfter(OffsetDateTime.now());
    }
}
