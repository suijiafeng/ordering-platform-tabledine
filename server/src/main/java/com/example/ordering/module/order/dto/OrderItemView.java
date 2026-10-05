package com.example.ordering.module.order.dto;

import com.example.ordering.module.order.entity.OrderItem;

public record OrderItemView(Long id, Long dishId, String dishName, String dishImage, String specDesc, String addonDesc,
                            long unitPrice, int quantity, long totalPrice, int refundedQty) {

    public static OrderItemView of(OrderItem i) {
        return new OrderItemView(i.getId(), i.getDishId(), i.getDishName(), i.getDishImage(), i.getSpecDesc(),
                i.getAddonDesc(), i.getUnitPrice(), i.getQuantity(), i.getTotalPrice(),
                i.getRefundedQty() == null ? 0 : i.getRefundedQty());
    }
}
