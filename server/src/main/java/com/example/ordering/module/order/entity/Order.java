package com.example.ordering.module.order.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.example.ordering.common.Platform;
import lombok.Data;

import java.time.OffsetDateTime;

/** 订单主表 orders。金额单位：分 */
@Data
@TableName("orders")
public class Order {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    /** 客户端请求 ID，与 customer_id 组成唯一键，防重复下单 */
    private String clientRequestId;
    private Long storeId;
    private Long tableId;
    /** 下单时的桌号快照 */
    private String tableCode;
    private Long customerId;
    private Platform platform;
    private OrderStatus status;
    private RefundStatusOfOrder refundStatus;
    /** 商品总额 */
    private Long totalAmount;
    /** 应付 / 实付金额（MVP 无优惠，等于 totalAmount） */
    private Long payAmount;
    private Long refundedAmount;
    private Integer peopleCount;
    private String remark;
    private OffsetDateTime payExpireAt;
    private OffsetDateTime paidAt;
    private OffsetDateTime acceptedAt;
    /** 后厨点「开始制作」的时间；为空表示待制作（仅商家端后厨看板使用） */
    private OffsetDateTime cookingStartedAt;
    /** 下单来源：CUSTOMER 顾客扫码 / MERCHANT 前厅代客下单（无顾客账号，customerId 为空） */
    private String source;
    /** 代客下单的员工 */
    private Long createdByStaffId;

    /** 付款模式：PAY_FIRST 先付后吃 / PAY_LATER 先吃后付（前厅代客下单可选，离店结账） */
    private String payMode;

    public static final String PAY_FIRST = "PAY_FIRST";
    public static final String PAY_LATER = "PAY_LATER";

    /** 先吃后付且还没结账：钱还没收，不能退款，取消时也不需要退款 */
    public boolean isUnsettled() {
        return PAY_LATER.equals(payMode) && paidAt == null;
    }

    public static final String SOURCE_CUSTOMER = "CUSTOMER";
    public static final String SOURCE_MERCHANT = "MERCHANT";
    /** 顾客接单后申请取消：APPLYING 待处理 / APPROVED 已同意 / REJECTED 已拒绝；为空表示没有申请过 */
    private String cancelRequestStatus;
    private String cancelRequestReason;
    private OffsetDateTime cancelRequestedAt;
    /** 商家拒绝取消的理由（顾客可见） */
    private String cancelRejectReason;
    private OffsetDateTime cancelHandledAt;
    private Long cancelHandledBy;

    public static final String CANCEL_APPLYING = "APPLYING";
    public static final String CANCEL_APPROVED = "APPROVED";
    public static final String CANCEL_REJECTED = "REJECTED";

    /** 是否有待商家处理的取消申请 */
    public boolean isCancelApplying() {
        return CANCEL_APPLYING.equals(cancelRequestStatus);
    }
    private OffsetDateTime readyAt;
    private OffsetDateTime doneAt;
    private OffsetDateTime cancelledAt;
    private String cancelReason;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /** 可退余额 = 实付 − 已退成功（处理中的由退款单层面保证同一时刻只有一笔） */
    public long refundableAmount() {
        return payAmount - (refundedAmount == null ? 0 : refundedAmount);
    }
}
