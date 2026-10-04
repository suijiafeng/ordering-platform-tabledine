package com.example.ordering.module.wallet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 钱包流水：每一次余额变动一条，balance_after 为变动后余额 */
@Data
@TableName("wallet_transaction")
public class WalletTransaction {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long storeId;
    private Long customerId;
    private WalletTransactionType type;
    /** 变动金额（分，恒为正；方向由 type 决定） */
    private Long amount;
    private Long balanceAfter;
    private Long orderId;
    /** PAY：商户订单号（唯一） */
    private String outTradeNo;
    /** REFUND：退款单号（唯一） */
    private String refundNo;
    /** RECHARGE：操作员工 */
    private Long operatorId;
    private String remark;
    /** 充值请求号（商家端生成，幂等用） */
    private String requestId;
    private OffsetDateTime createdAt;
}
