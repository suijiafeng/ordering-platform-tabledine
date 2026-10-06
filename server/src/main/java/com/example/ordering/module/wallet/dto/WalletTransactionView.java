package com.example.ordering.module.wallet.dto;

import com.example.ordering.module.wallet.entity.WalletTransaction;
import com.example.ordering.module.wallet.entity.WalletTransactionType;

import java.time.OffsetDateTime;

/**
 * 钱包流水（顾客端 / 商家端共用）。金额单位为分。
 *
 * @param amount       变动金额（恒为正）
 * @param credit       true 余额增加（充值 / 退款返还），false 余额减少（下单扣费）
 * @param balanceAfter 变动后余额
 */
public record WalletTransactionView(Long id, WalletTransactionType type, boolean credit, long amount, long balanceAfter,
                                    Long orderId, String outTradeNo, String refundNo, String remark, OffsetDateTime createdAt) {

    public static WalletTransactionView of(WalletTransaction t) {
        return new WalletTransactionView(t.getId(), t.getType(), t.getType().isCredit(), t.getAmount(), t.getBalanceAfter(),
                t.getOrderId(), t.getOutTradeNo(), t.getRefundNo(), t.getRemark(), t.getCreatedAt());
    }
}
