package com.example.ordering.module.order.dto;

/** abandoned 为 true 才能丢弃原请求；已有订单只返回详情，绝不自动取消或支付。 */
public record AbandonCheckoutResult(boolean abandoned, OrderDetail order) {
}
