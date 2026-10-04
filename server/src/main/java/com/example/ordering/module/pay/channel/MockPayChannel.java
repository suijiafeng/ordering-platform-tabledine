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
 *   <li>退款（渠道侧状态按退款单号记住，查询返回记住的状态，未提交过的返回「查无此单」）：
 *     <ul>
 *       <li>原因含 {@code mock-fail}：失败</li>
 *       <li>含 {@code mock-throw}：首次提交抛异常且渠道未受理（模拟请求没到达），重新提交成功</li>
 *       <li>含 {@code mock-lost}：首次提交渠道已退款成功但响应超时（模拟结果丢失）</li>
 *       <li>含 {@code mock-pending}：处理中，第二次查询成功</li>
 *       <li>其他：立即成功</li>
 *     </ul>
 *   </li>
 * </ul>
 */
@Slf4j
public class MockPayChannel implements PayChannel {

    private final Platform platform;
    /** outTradeNo → 模拟已支付的交易号 */
    private final Map<String, String> paid = new ConcurrentHashMap<>();
    private final Map<String, String> closed = new ConcurrentHashMap<>();
    /** 测试钩子：这些商户单号查单时模拟渠道故障 */
    private final java.util.Set<String> queryErrors = ConcurrentHashMap.newKeySet();
    private final Map<String, Integer> pendingRefundHits = new ConcurrentHashMap<>();
    /** 退款单号 → 渠道侧结果 */
    private final Map<String, RefundResult> refunds = new ConcurrentHashMap<>();
    private final Map<String, Integer> submitCount = new ConcurrentHashMap<>();

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
        if (queryErrors.contains(outTradeNo)) {
            throw new RuntimeException("模拟渠道：查单超时");
        }
        String txn = paid.get(outTradeNo);
        if (txn != null) {
            return new PayQueryResult(PayQueryResult.State.SUCCESS, txn, null, OffsetDateTime.now());
        }
        if (closed.containsKey(outTradeNo)) {
            return new PayQueryResult(PayQueryResult.State.CLOSED, null, null, null);
        }
        return PayQueryResult.notPaid();
    }

    /** 测试 / 联调钩子：模拟某笔支付查单时渠道故障 */
    public void simulateQueryError(String outTradeNo, boolean on) {
        if (on) {
            queryErrors.add(outTradeNo);
        } else {
            queryErrors.remove(outTradeNo);
        }
    }

    @Override
    public void closePayment(String outTradeNo) {
        closed.put(outTradeNo, "1");
    }

    @Override
    public RefundResult refund(RefundChannelRequest req) {
        String reason = req.reason() == null ? "" : req.reason();
        int attempt = submitCount.merge(req.refundNo(), 1, Integer::sum);
        RefundResult existing = refunds.get(req.refundNo());
        if (existing != null && existing.state() == RefundResult.State.SUCCESS) {
            return existing;  // 同一单号重复提交：幂等返回已有结果，不重复出款
        }
        if (reason.contains("mock-throw") && attempt == 1) {
            throw new RuntimeException("模拟渠道：连接超时");
        }
        RefundResult result;
        if (reason.contains("mock-fail")) {
            result = RefundResult.failed("模拟渠道：余额不足");
        } else if (reason.contains("mock-pending")) {
            pendingRefundHits.put(req.refundNo(), 0);
            result = RefundResult.processing("MOCKR" + req.refundNo());
        } else {
            result = RefundResult.success("MOCKR" + req.refundNo());
        }
        refunds.put(req.refundNo(), result);
        if (reason.contains("mock-lost") && attempt == 1) {
            throw new RuntimeException("模拟渠道：读取响应超时");
        }
        return result;
    }

    @Override
    public RefundResult queryRefund(String refundNo, String outTradeNo) {
        RefundResult known = refunds.get(refundNo);
        if (known == null) {
            return RefundResult.notFound();
        }
        // 处理中的模拟退款：第二次查询即成功
        Integer hits = pendingRefundHits.get(refundNo);
        if (hits != null) {
            if (hits < 1) {
                pendingRefundHits.put(refundNo, hits + 1);
                return RefundResult.processing("MOCKR" + refundNo);
            }
            RefundResult done = RefundResult.success("MOCKR" + refundNo);
            refunds.put(refundNo, done);
            return done;
        }
        return known;
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
