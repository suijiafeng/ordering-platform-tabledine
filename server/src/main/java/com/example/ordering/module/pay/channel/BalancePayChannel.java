package com.example.ordering.module.pay.channel;

import com.example.ordering.module.wallet.service.WalletService;
import org.springframework.stereotype.Component;

/**
 * 余额支付：会员下单从账户余额扣费，资金只在本系统内流转（唯一的支付方式）。
 * <ul>
 *   <li>扣费在 {@code PayService.initiate} 的同一事务里完成并直接入账，这里只负责生成交易号</li>
 *   <li>退款：返还余额，按退款单号幂等；由 RefundService 在事务提交后调用，失败时由补偿任务按
 *       {@link #queryRefund} 的结果重试或回写</li>
 * </ul>
 */
@Component
public class BalancePayChannel {

    static final String TRANSACTION_PREFIX = "BAL";
    static final String REFUND_PREFIX = "BALR";

    private final WalletService walletService;

    public BalancePayChannel(WalletService walletService) {
        this.walletService = walletService;
    }

    /** 余额扣费的交易号：没有外部渠道，用商户订单号派生，保证唯一 */
    public static String transactionNo(String outTradeNo) {
        return TRANSACTION_PREFIX + outTradeNo;
    }

    /** 退款到余额；同一退款单号重复调用只返还一次 */
    public RefundResult refund(String refundNo, String outTradeNo, long amountInCents) {
        walletService.refund(refundNo, outTradeNo, amountInCents);
        return RefundResult.success(REFUND_PREFIX + refundNo);
    }

    /** 以钱包流水为准：有返还流水即成功，否则视为未提交（可用同一单号安全重提） */
    public RefundResult queryRefund(String refundNo) {
        return walletService.findByRefundNo(refundNo) != null
                ? RefundResult.success(REFUND_PREFIX + refundNo)
                : RefundResult.notFound();
    }
}
