package com.example.ordering.module.pay.channel;

import com.example.ordering.common.Platform;
import com.example.ordering.module.wallet.entity.WalletTransaction;
import com.example.ordering.module.wallet.service.WalletService;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 余额支付「渠道」：H5 会员下单从账户余额扣费，资金在本系统内流转。
 * <ul>
 *   <li>扣费不在这里发生，而在 {@code PayService.initiate} 的同一事务里完成并直接入账（没有拉起支付、没有回调）；
 *       {@link #createPayment} 只返回给前端的标记</li>
 *   <li>退款：返还余额，按退款单号幂等；同步返回成功，不需要补偿查询</li>
 *   <li>查单 / 退款查询：以钱包流水为准，供补偿任务复用同一套逻辑</li>
 * </ul>
 * 与 Mock 渠道无关：生产环境同样可用。
 */
@Component
public class BalancePayChannel implements PayChannel {

    static final String TRANSACTION_PREFIX = "BAL";
    static final String REFUND_PREFIX = "BALR";

    private final WalletService walletService;

    public BalancePayChannel(WalletService walletService) {
        this.walletService = walletService;
    }

    @Override
    public Platform platform() {
        return Platform.H5;
    }

    /** 余额扣费的「渠道交易号」：没有外部渠道，用商户订单号派生，保证唯一 */
    public static String transactionNo(String outTradeNo) {
        return TRANSACTION_PREFIX + outTradeNo;
    }

    @Override
    public Map<String, Object> createPayment(PayCreateRequest req) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("balance", true);
        params.put("paid", true);
        params.put("outTradeNo", req.outTradeNo());
        params.put("amount", req.amount());
        return params;
    }

    @Override
    public PayQueryResult queryPayment(String outTradeNo) {
        WalletTransaction paid = walletService.findByOutTradeNo(outTradeNo);
        if (paid != null) {
            return new PayQueryResult(PayQueryResult.State.SUCCESS, transactionNo(outTradeNo), paid.getAmount(), paid.getCreatedAt());
        }
        return PayQueryResult.notPaid();
    }

    @Override
    public void closePayment(String outTradeNo) {
        // 余额支付要么在下单扣费时即刻成功，要么没有发生，没有「待支付」需要关闭
    }

    @Override
    public RefundResult refund(RefundChannelRequest req) {
        walletService.refund(req.refundNo(), req.outTradeNo(), req.refundAmount());
        return RefundResult.success(REFUND_PREFIX + req.refundNo());
    }

    @Override
    public RefundResult queryRefund(String refundNo, String outTradeNo) {
        return walletService.findByRefundNo(refundNo) != null
                ? RefundResult.success(REFUND_PREFIX + refundNo)
                : RefundResult.notFound();
    }

    @Override
    public PayNotify parsePayNotify(NotifyRequest req) {
        throw new IllegalArgumentException("余额支付没有渠道回调");
    }

    @Override
    public String notifyAck(boolean ok) {
        return ok ? "success" : "fail";
    }
}
