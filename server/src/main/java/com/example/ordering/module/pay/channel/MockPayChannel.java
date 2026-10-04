package com.example.ordering.module.pay.channel;

import com.example.ordering.common.Platform;
import lombok.extern.slf4j.Slf4j;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 开发环境模拟渠道：不产生任何真实资金往来。
 * <ul>
 *   <li>下单返回 {@code {mock:true, outTradeNo}}，小程序 / 测试通过 {@code POST /api/v1/c/orders/{orderNo}/mock-pay} 模拟支付成功</li>
 *   <li>退款：原因含 {@code mock-fail} 时返回失败，含 {@code mock-throw} 时抛异常（模拟超时），
 *       含 {@code mock-pending} 时返回处理中（之后查询返回成功），否则立即成功</li>
 * </ul>
 */
@Slf4j
public class MockPayChannel implements PayChannel {

    private final Platform platform;
    /** outTradeNo → 模拟已支付的交易号 */
    private final Map<String, String> paid = new ConcurrentHashMap<>();
    private final Map<String, String> closed = new ConcurrentHashMap<>();
    private final Map<String, Integer> pendingRefundHits = new ConcurrentHashMap<>();

    public MockPayChannel(Platform platform) {
        this.platform = platform;
    }

    @Override
    public Platform platform() {
        return platform;
    }

    @Override
    public Map<String, Object> createPayment(PayCreateRequest req) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("mock", true);
        params.put("channel", platform.name());
        params.put("outTradeNo", req.outTradeNo());
        params.put("amount", req.amount());
        return params;
    }

    /** 由 mock-pay 接口调用：标记该商户单号已支付 */
    public String markPaid(String outTradeNo) {
        return paid.computeIfAbsent(outTradeNo, k -> "MOCK" + System.currentTimeMillis());
    }

    @Override
    public PayQueryResult queryPayment(String outTradeNo) {
        String txn = paid.get(outTradeNo);
        if (txn != null) {
            return new PayQueryResult(PayQueryResult.State.SUCCESS, txn, null, OffsetDateTime.now());
        }
        if (closed.containsKey(outTradeNo)) {
            return new PayQueryResult(PayQueryResult.State.CLOSED, null, null, null);
        }
        return PayQueryResult.notPaid();
    }

    @Override
    public void closePayment(String outTradeNo) {
        closed.put(outTradeNo, "1");
    }

    @Override
    public RefundResult refund(RefundChannelRequest req) {
        String reason = req.reason() == null ? "" : req.reason();
        if (reason.contains("mock-throw")) {
            throw new RuntimeException("模拟渠道：连接超时");
        }
        if (reason.contains("mock-fail")) {
            return RefundResult.failed("模拟渠道：余额不足");
        }
        if (reason.contains("mock-pending")) {
            pendingRefundHits.put(req.refundNo(), 0);
            return RefundResult.processing("MOCKR" + req.refundNo());
        }
        return RefundResult.success("MOCKR" + req.refundNo());
    }

    @Override
    public RefundResult queryRefund(String refundNo, String outTradeNo) {
        // 处理中的模拟退款：第二次查询即成功
        Integer hits = pendingRefundHits.get(refundNo);
        if (hits != null && hits < 1) {
            pendingRefundHits.put(refundNo, hits + 1);
            return RefundResult.processing("MOCKR" + refundNo);
        }
        return RefundResult.success("MOCKR" + refundNo);
    }

    @Override
    public PayNotify parsePayNotify(NotifyRequest req) {
        throw new IllegalArgumentException("Mock 渠道不接收回调");
    }

    @Override
    public String notifyAck(boolean ok) {
        return ok ? "success" : "fail";
    }
}
