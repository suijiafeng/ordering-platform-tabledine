package com.example.ordering.module.pay.channel;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.auth.client.AlipaySigner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * 支付宝小程序支付（alipay.trade.create → my.tradePay）、查单、关单、退款、退款查询、异步通知验签。
 * <p>
 * 复用登录模块的 {@link AlipaySigner}（RSA2 请求签名）；同步响应与异步通知均用支付宝公钥验签。
 * 金额：支付宝以元为单位（两位小数），内部统一为分。
 */
@Slf4j
@Component
public class AlipayChannel implements PayChannel {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");

    private final AppProperties.Alipay props;
    private final ObjectMapper objectMapper;
    private final HttpClient http;

    public AlipayChannel(AppProperties appProperties, ObjectMapper objectMapper) {
        this.props = appProperties.getAlipay();
        this.objectMapper = objectMapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public Platform platform() {
        return Platform.ALIPAY;
    }

    @Override
    public Map<String, Object> createPayment(PayCreateRequest req) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", req.outTradeNo());
        biz.put("total_amount", yuan(req.amount()));
        biz.put("subject", req.description());
        // 小程序支付产品码；未签约 JSAPI_PAY 时默认 FACE_TO_FACE_PAYMENT 会被拒（ACCESS_FORBIDDEN）
        biz.put("product_code", "JSAPI_PAY");
        // 老应用登录拿到的是 user_id（2088 开头 16 位），新应用是 open_id；传错字段会导致下单失败
        if (req.payerOpenId() != null && req.payerOpenId().matches("2088\\d{12}")) {
            biz.put("buyer_id", req.payerOpenId());
        } else {
            biz.put("buyer_open_id", req.payerOpenId());
        }
        biz.put("time_expire", req.expireAt().atZoneSameInstant(CN).format(TS));
        JsonNode resp = call("alipay.trade.create", biz, req.notifyUrl(), ErrorCode.PAY_CHANNEL_ERROR);
        String tradeNo = resp.path("trade_no").asText(null);
        if (!StringUtils.hasText(tradeNo)) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝下单未返回 trade_no");
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("tradeNO", tradeNo);
        return params;
    }

    @Override
    public PayQueryResult queryPayment(String outTradeNo) {
        JsonNode resp = callRaw("alipay.trade.query", Map.of("out_trade_no", outTradeNo), null);
        String code = resp.path("code").asText("");
        if ("40004".equals(code) && "ACQ.TRADE_NOT_EXIST".equals(resp.path("sub_code").asText(""))) {
            return PayQueryResult.notPaid();
        }
        if (!"10000".equals(code)) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝查单失败：" + resp.path("sub_msg").asText(resp.path("msg").asText()));
        }
        String status = resp.path("trade_status").asText("");
        return switch (status) {
            case "TRADE_SUCCESS", "TRADE_FINISHED" -> new PayQueryResult(PayQueryResult.State.SUCCESS,
                    resp.path("trade_no").asText(null), fen(resp.path("total_amount").asText("0")),
                    parseTime(resp.path("send_pay_date").asText(null)));
            case "WAIT_BUYER_PAY" -> PayQueryResult.notPaid();
            case "TRADE_CLOSED" -> new PayQueryResult(PayQueryResult.State.CLOSED, null, null, null);
            default -> PayQueryResult.unknown();
        };
    }

    @Override
    public void closePayment(String outTradeNo) {
        JsonNode resp = callRaw("alipay.trade.close", Map.of("out_trade_no", outTradeNo), null);
        String code = resp.path("code").asText("");
        // 交易不存在（用户从未拉起支付）视为已关闭
        if (!"10000".equals(code) && !"ACQ.TRADE_NOT_EXIST".equals(resp.path("sub_code").asText(""))) {
            log.warn("支付宝关单返回 {} {}", code, resp.path("sub_msg").asText());
        }
    }

    @Override
    public RefundResult refund(RefundChannelRequest req) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", req.outTradeNo());
        biz.put("refund_amount", yuan(req.refundAmount()));
        biz.put("out_request_no", req.refundNo());
        if (StringUtils.hasText(req.reason())) {
            biz.put("refund_reason", req.reason());
        }
        JsonNode resp = callRaw("alipay.trade.refund", biz, null);
        String code = resp.path("code").asText("");
        if ("10000".equals(code)) {
            // fund_change=Y 表示本次调用发生了资金变动；N 表示该退款单号之前已成功（幂等重试），也按成功处理
            return RefundResult.success(resp.path("trade_no").asText(null));
        }
        String subMsg = resp.path("sub_msg").asText(resp.path("msg").asText("支付宝退款失败"));
        if ("20000".equals(code)) {
            // 服务不可用 / 结果不明确 → 交给查询确认
            return RefundResult.unknown();
        }
        log.warn("支付宝退款失败 code={} subCode={} msg={}", code, resp.path("sub_code").asText(), subMsg);
        return RefundResult.failed("支付宝：" + subMsg);
    }

    @Override
    public RefundResult queryRefund(String refundNo, String outTradeNo) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);
        biz.put("out_request_no", refundNo);
        JsonNode resp = callRaw("alipay.trade.fastpay.refund.query", biz, null);
        if (!"10000".equals(resp.path("code").asText(""))) {
            return RefundResult.unknown();
        }
        if ("REFUND_SUCCESS".equals(resp.path("refund_status").asText(""))) {
            return RefundResult.success(resp.path("trade_no").asText(null));
        }
        // 支付宝文档：未返回 refund_status 表示「退款请求未收到或退款失败」。
        // 两种情况都可以用同一 out_request_no 重新提交：已退过的会返回成功（fund_change=N），不会重复出款。
        return RefundResult.notFound();
    }

    @Override
    public PayNotify parsePayNotify(NotifyRequest req) {
        Map<String, String> params = req.formParams();
        if (params == null || params.isEmpty()) {
            throw new IllegalArgumentException("支付宝通知参数为空");
        }
        if (!verifyParams(params)) {
            throw new IllegalArgumentException("支付宝通知验签失败");
        }
        if (StringUtils.hasText(props.getAppId()) && !props.getAppId().equals(params.get("app_id"))) {
            throw new IllegalArgumentException("支付宝通知 app_id 不匹配");
        }
        String status = params.getOrDefault("trade_status", "");
        boolean success = "TRADE_SUCCESS".equals(status) || "TRADE_FINISHED".equals(status);
        return new PayNotify(params.get("out_trade_no"), params.get("trade_no"),
                fen(params.getOrDefault("total_amount", "0")), success, parseTime(params.get("gmt_payment")));
    }

    @Override
    public String notifyAck(boolean ok) {
        return ok ? "success" : "fail";
    }

    // ==================== 网关调用 ====================

    private JsonNode call(String method, Map<String, Object> biz, String notifyUrl, ErrorCode errorCode) {
        JsonNode resp = callRaw(method, biz, notifyUrl);
        if (!"10000".equals(resp.path("code").asText(""))) {
            String msg = resp.path("sub_msg").asText(resp.path("msg").asText("支付宝调用失败"));
            log.warn("支付宝 {} 失败 code={} subCode={} msg={}", method, resp.path("code").asText(),
                    resp.path("sub_code").asText(), msg);
            throw new BusinessException(errorCode, "支付宝：" + msg);
        }
        return resp;
    }

    /** 调用网关并校验同步响应签名，返回 xxx_response 节点（或 error_response） */
    private JsonNode callRaw(String method, Map<String, Object> biz, String notifyUrl) {
        requireConfigured();
        Map<String, String> params = new HashMap<>();
        params.put("app_id", props.getAppId());
        params.put("method", method);
        params.put("format", "JSON");
        params.put("charset", "utf-8");
        params.put("sign_type", "RSA2");
        params.put("timestamp", ZonedDateTime.now(CN).format(TS));
        params.put("version", "1.0");
        if (StringUtils.hasText(notifyUrl)) {
            params.put("notify_url", notifyUrl);
        }
        try {
            params.put("biz_content", objectMapper.writeValueAsString(biz));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        params.put("sign", AlipaySigner.sign(params, props.getPrivateKey()));
        // 与官方 SDK 一致：系统参数（含 charset、sign）放 URL，业务参数放表单体。
        // 网关按 URL 上的 charset 解码表单体；charset 只在表单里时可能按 GBK 解码中文，导致验签失败
        String query = params.entrySet().stream()
                .filter(e -> !"biz_content".equals(e.getKey()))
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        String form = "biz_content=" + URLEncoder.encode(params.get("biz_content"), StandardCharsets.UTF_8);
        String gateway = props.getGateway() + (props.getGateway().contains("?") ? "&" : "?") + query;
        String body;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(gateway))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                    .build();
            body = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)).body();
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("调用支付宝 {} 异常", method, e);
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝网络异常");
        }
        String nodeName = method.replace('.', '_') + "_response";
        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝响应解析失败");
        }
        // 同步响应验签：对 xxx_response / error_response 节点的原始 JSON 文本验签（网关对两者都签名）。
        // 错误应答同样会驱动业务（如「交易不存在」→ 关单、「退款失败」），不验签就能被伪造
        String actualNode = root.has(nodeName) ? nodeName : "error_response";
        if (!root.has(actualNode)) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝响应格式异常");
        }
        String sign = root.path("sign").asText(null);
        String raw = extractRawNode(body, actualNode);
        if (sign == null || raw == null || !verify(raw, sign)) {
            log.warn("支付宝 {} 同步响应验签失败（{}）", method, actualNode);
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "支付宝响应验签失败");
        }
        return root.get(actualNode);
    }

    /** 从原始响应中截取 "nodeName":{...} 的大括号内容（支付宝签名基于原文，不能重新序列化） */
    static String extractRawNode(String body, String nodeName) {
        int keyIdx = body.indexOf("\"" + nodeName + "\"");
        if (keyIdx < 0) {
            return null;
        }
        int start = body.indexOf('{', keyIdx);
        if (start < 0) {
            return null;
        }
        int depth = 0;
        boolean inString = false;
        for (int i = start; i < body.length(); i++) {
            char c = body.charAt(i);
            if (inString) {
                if (c == '\\') {
                    i++;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return body.substring(start, i + 1);
                }
            }
        }
        return null;
    }

    private boolean verifyParams(Map<String, String> params) {
        String sign = params.get("sign");
        if (!StringUtils.hasText(sign)) {
            return false;
        }
        String content = new TreeMap<>(params).entrySet().stream()
                .filter(e -> !"sign".equals(e.getKey()) && !"sign_type".equals(e.getKey()))
                .filter(e -> e.getValue() != null && !e.getValue().isEmpty())
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining("&"));
        return verify(content, sign);
    }

    private boolean verify(String content, String signBase64) {
        if (!StringUtils.hasText(props.getAlipayPublicKey())) {
            throw new IllegalStateException("未配置支付宝公钥（app.alipay.alipay-public-key），无法验签");
        }
        try {
            byte[] keyBytes = Base64.getDecoder().decode(props.getAlipayPublicKey().replaceAll("\\s", ""));
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initVerify(key);
            s.update(content.getBytes(StandardCharsets.UTF_8));
            return s.verify(Base64.getDecoder().decode(signBase64));
        } catch (Exception e) {
            log.warn("支付宝验签异常", e);
            return false;
        }
    }

    private static String yuan(long fen) {
        return BigDecimal.valueOf(fen).movePointLeft(2).setScale(2).toPlainString();
    }

    /** 元 → 分；无法精确换算返回 -1，入账时会因金额不符被拒绝 */
    static long fen(String yuan) {
        try {
            return new BigDecimal(yuan).movePointRight(2).longValueExact();
        } catch (Exception e) {
            return -1L;
        }
    }

    private static OffsetDateTime parseTime(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return LocalDateTime.parse(s, TS).atZone(CN).toOffsetDateTime();
        } catch (Exception e) {
            return null;
        }
    }

    private void requireConfigured() {
        // 支付宝公钥同样必需：没有它就无法校验同步响应和异步通知，查单结果可被伪造
        if (!StringUtils.hasText(props.getAppId()) || !StringUtils.hasText(props.getPrivateKey())
                || !StringUtils.hasText(props.getAlipayPublicKey())) {
            throw new IllegalStateException("未配置支付宝（app.alipay.app-id / private-key / alipay-public-key）");
        }
    }
}
