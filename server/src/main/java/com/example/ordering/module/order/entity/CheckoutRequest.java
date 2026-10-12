package com.example.ordering.module.order.entity;

import lombok.Data;

/** 顾客下单请求的永久身份；abandoned 墓碑阻止迟到的旧请求再次创建订单。 */
@Data
public class CheckoutRequest {
    private Long customerId;
    private String clientRequestId;
    private boolean abandoned;
}
