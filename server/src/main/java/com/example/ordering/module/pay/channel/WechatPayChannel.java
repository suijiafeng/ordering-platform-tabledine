package com.example.ordering.module.pay.channel;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 微信支付 APIv3 —— 小程序 JSAPI 支付、查单、关单、退款、回调验签与解密。
 * <p>
 * 不依赖官方 SDK，签名 / 验签 / 解密按 APIv3 规范用 JDK 实现：
 * <ul>
 *   <li>请求签名：商户 API 私钥 SHA256withRSA，{@code Authorization: WECHATPAY2-SHA256-RSA2048 ...}</li>
 *   <li>回调验签：微信支付公钥（{@code app.wechat-pay.platform-public-key}，公钥 ID 以 PUB_KEY_ID_ 开头）</li>
 *   <li>回调解密：APIv3 密钥 AES-256-GCM</li>
 * </ul>
 * 配置缺失时相关调用抛 IllegalStateException，提示补齐配置。
 */
@Slf4j
@Component
public class WechatPayChannel implements PayChannel {

    private static final DateTimeFormatter RFC3339 = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");
    private static final ZoneId CN = ZoneId.of("Asia/Shanghai");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties.WechatPay props;
    private final String appId;
    private final ObjectMapper objectMapper;
    private final HttpClient http;

    public WechatPayChannel(AppProperties appProperties, ObjectMapper objectMapper) {
        this.props = appProperties.getWechatPay();
        this.appId = appProperties.getWechat().getAppId();
        this.objectMapper = objectMapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public Platform platform() {
        return Platform.WECHAT;
    }

    // ==================== 下单 / 查单 / 关单 ====================

    @Override
    public Map<String, Object> createPayment(PayCreateRequest req) {
        requireConfigured();
        ObjectNode body = objectMapper.createObjectNode();
        body.put("appid", appId);
        body.put("mchid", props.getMchId());
        body.put("description", req.description());
        body.put("out_trade_no", req.outTradeNo());
        body.put("time_expire", req.expireAt().atZoneSameInstant(CN).format(RFC3339));
        body.put("notify_url", req.notifyUrl());
        body.putObject("amount").put("total", req.amount()).put("currency", "CNY");
        body.putObject("payer").put("openid", req.payerOpenId());

        JsonNode resp = call("POST", "/v3/pay/transactions/jsapi", body.toString(), ErrorCode.PAY_CHANNEL_ERROR);
        String prepayId = resp.path("prepay_id").asText(null);
        if (!StringUtils.hasText(prepayId)) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "微信下单未返回 prepay_id");
        }
        // 小程序 wx.requestPayment 参数
        String timeStamp = String.valueOf(System.currentTimeMillis() / 1000);
        String nonceStr = nonce();
        String pkg = "prepay_id=" + prepayId;
        String paySign = sign(appId + "\n" + timeStamp + "\n" + nonceStr + "\n" + pkg + "\n");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("appId", appId);
        params.put("timeStamp", timeStamp);
        params.put("nonceStr", nonceStr);
        params.put("package", pkg);
        params.put("signType", "RSA");
        params.put("paySign", paySign);
        return params;
    }

    @Override
    public PayQueryResult queryPayment(String outTradeNo) {
        requireConfigured();
        HttpResponse<String> resp = send("GET",
                "/v3/pay/transactions/out-trade-no/" + outTradeNo + "?mchid=" + props.getMchId(), null);
        if (resp.statusCode() == 404) {
            return PayQueryResult.notPaid();
        }
        JsonNode node = parseOk(resp, ErrorCode.PAY_CHANNEL_ERROR);
        return toQueryResult(node);
    }

    private static PayQueryResult toQueryResult(JsonNode node) {
        String state = node.path("trade_state").asText("");
        return switch (state) {
            case "SUCCESS" -> new PayQueryResult(PayQueryResult.State.SUCCESS,
                    node.path("transaction_id").asText(null),
                    node.path("amount").path("total").asLong(),
                    parseTime(node.path("success_time").asText(null)));
            case "NOTPAY", "USERPAYING", "ACCEPT" -> PayQueryResult.notPaid();
            case "CLOSED", "REVOKED", "PAYERROR" -> new PayQueryResult(PayQueryResult.State.CLOSED, null, null, null);
            default -> PayQueryResult.unknown();
        };
    }

    @Override
    public void closePayment(String outTradeNo) {
        requireConfigured();
        String body = "{\"mchid\":\"" + props.getMchId() + "\"}";
        HttpResponse<String> resp = send("POST", "/v3/pay/transactions/out-trade-no/" + outTradeNo + "/close", body);
        // 204 成功；订单已关闭 / 不存在也视为成功，已支付的订单关单会返回 400 ORDER_PAID，由查单补偿处理
        if (resp.statusCode() >= 300 && resp.statusCode() != 404) {
            log.warn("微信关单返回 {} {}", resp.statusCode(), resp.body());
        }
    }

    // ==================== 退款 ====================

    @Override
    public RefundResult refund(RefundChannelRequest req) {
        requireConfigured();
        ObjectNode body = objectMapper.createObjectNode();
        if (StringUtils.hasText(req.transactionNo())) {
            body.put("transaction_id", req.transactionNo());
        } else {
            body.put("out_trade_no", req.outTradeNo());
        }
        body.put("out_refund_no", req.refundNo());
        if (StringUtils.hasText(req.reason())) {
            body.put("reason", req.reason().length() > 80 ? req.reason().substring(0, 80) : req.reason());
        }
        if (StringUtils.hasText(req.notifyUrl())) {
            body.put("notify_url", req.notifyUrl());
        }
        body.putObject("amount").put("refund", req.refundAmount()).put("total", req.totalAmount()).put("currency", "CNY");

        HttpResponse<String> resp = send("POST", "/v3/refund/domestic/refunds", body.toString());
        if (resp.statusCode() >= 300) {
            // 业务性失败（余额不足、超期等）返回明确原因，交给业务侧标记 FAILED
            String msg = errorMessage(resp.body());
            log.warn("微信退款申请失败 {} {}", resp.statusCode(), resp.body());
            if (resp.statusCode() >= 500) {
                throw new BusinessException(ErrorCode.REFUND_CHANNEL_ERROR, msg);
            }
            return RefundResult.failed(msg);
        }
        return toRefundResult(parseJson(resp.body()));
    }

    @Override
    public RefundResult queryRefund(String refundNo, String outTradeNo) {
        requireConfigured();
        HttpResponse<String> resp = send("GET", "/v3/refund/domestic/refunds/" + refundNo, null);
        if (resp.statusCode() == 404) {
            return RefundResult.unknown();
        }
        return toRefundResult(parseOk(resp, ErrorCode.REFUND_CHANNEL_ERROR));
    }

    private static RefundResult toRefundResult(JsonNode node) {
        String status = node.path("status").asText("");
        String refundId = node.path("refund_id").asText(null);
        return switch (status) {
            case "SUCCESS" -> RefundResult.success(refundId);
            case "PROCESSING" -> RefundResult.processing(refundId);
            case "ABNORMAL" -> RefundResult.failed("微信退款异常（ABNORMAL），请检查商户平台");
            case "CLOSED" -> RefundResult.failed("微信退款已关闭");
            default -> RefundResult.unknown();
        };
    }

    // ==================== 回调 ====================

    @Override
    public PayNotify parsePayNotify(NotifyRequest req) {
        JsonNode resource = verifyAndDecrypt(req);
        String state = resource.path("trade_state").asText("");
        return new PayNotify(
                resource.path("out_trade_no").asText(),
                resource.path("transaction_id").asText(null),
                resource.path("amount").path("total").asLong(),
                "SUCCESS".equals(state),
                parseTime(resource.path("success_time").asText(null)));
    }

    @Override
    public RefundNotify parseRefundNotify(NotifyRequest req) {
        JsonNode resource = verifyAndDecrypt(req);
        String status = resource.path("refund_status").asText("");
        RefundResult result = switch (status) {
            case "SUCCESS" -> RefundResult.success(resource.path("refund_id").asText(null));
            case "ABNORMAL" -> RefundResult.failed("微信退款异常（ABNORMAL），请检查商户平台");
            case "CLOSED" -> RefundResult.failed("微信退款已关闭");
            default -> RefundResult.unknown();
        };
        return new RefundNotify(resource.path("out_refund_no").asText(), resource.path("out_trade_no").asText(null), result);
    }

    @Override
    public String notifyAck(boolean ok) {
        return ok ? "{\"code\":\"SUCCESS\",\"message\":\"成功\"}" : "{\"code\":\"FAIL\",\"message\":\"处理失败\"}";
    }

    /** 验签（微信支付公钥）+ 解密 resource（AES-256-GCM） */
    private JsonNode verifyAndDecrypt(NotifyRequest req) {
        String timestamp = req.header("Wechatpay-Timestamp");
        String nonce = req.header("Wechatpay-Nonce");
        String signature = req.header("Wechatpay-Signature");
        String serial = req.header("Wechatpay-Serial");
        if (!StringUtils.hasText(timestamp) || !StringUtils.hasText(nonce) || !StringUtils.hasText(signature)) {
            throw new IllegalArgumentException("缺少微信支付签名头");
        }
        if (StringUtils.hasText(props.getPlatformPublicKeyId()) && !props.getPlatformPublicKeyId().equals(serial)) {
            throw new IllegalArgumentException("微信支付公钥 ID 不匹配: " + serial);
        }
        if (Math.abs(System.currentTimeMillis() / 1000 - Long.parseLong(timestamp)) > 300) {
            throw new IllegalArgumentException("微信回调时间戳超出 5 分钟窗口");
        }
        String message = timestamp + "\n" + nonce + "\n" + req.body() + "\n";
        if (!verify(message, signature)) {
            throw new IllegalArgumentException("微信回调验签失败");
        }
        JsonNode root = parseJson(req.body());
        JsonNode res = root.path("resource");
        String plain = decrypt(res.path("associated_data").asText(""), res.path("nonce").asText(),
                res.path("ciphertext").asText());
        return parseJson(plain);
    }

    // ==================== HTTP 与签名工具 ====================

    private JsonNode call(String method, String path, String body, ErrorCode errorCode) {
        return parseOk(send(method, path, body), errorCode);
    }

    private HttpResponse<String> send(String method, String pathWithQuery, String body) {
        String payload = body == null ? "" : body;
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String nonceStr = nonce();
        String message = method + "\n" + pathWithQuery + "\n" + timestamp + "\n" + nonceStr + "\n" + payload + "\n";
        String token = String.format(
                "WECHATPAY2-SHA256-RSA2048 mchid=\"%s\",nonce_str=\"%s\",signature=\"%s\",timestamp=\"%s\",serial_no=\"%s\"",
                props.getMchId(), nonceStr, sign(message), timestamp, props.getSerialNo());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(props.getApiBase() + pathWithQuery))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", token)
                .header("Accept", "application/json")
                .header("User-Agent", "ordering-server/1.0");
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8));
        }
        try {
            return http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("调用微信支付 {} {} 异常", method, pathWithQuery, e);
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "微信支付网络异常");
        }
    }

    private JsonNode parseOk(HttpResponse<String> resp, ErrorCode errorCode) {
        if (resp.statusCode() >= 300) {
            log.warn("微信支付接口返回 {} {}", resp.statusCode(), resp.body());
            throw new BusinessException(errorCode, errorMessage(resp.body()));
        }
        return parseJson(resp.body());
    }

    private String errorMessage(String body) {
        try {
            JsonNode n = objectMapper.readTree(body);
            String msg = n.path("message").asText(null);
            return msg == null ? "微信支付调用失败" : "微信支付：" + msg;
        } catch (Exception e) {
            return "微信支付调用失败";
        }
    }

    private JsonNode parseJson(String body) {
        try {
            return objectMapper.readTree(body == null || body.isBlank() ? "{}" : body);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.PAY_CHANNEL_ERROR, "微信支付响应解析失败");
        }
    }

    private String sign(String message) {
        try {
            byte[] keyBytes = Base64.getDecoder().decode(props.getPrivateKey().replaceAll("\\s", ""));
            PrivateKey key = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initSign(key);
            s.update(message.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (Exception e) {
            throw new IllegalStateException("微信支付签名失败，请检查商户 API 私钥（PKCS8）", e);
        }
    }

    private boolean verify(String message, String signatureBase64) {
        if (!StringUtils.hasText(props.getPlatformPublicKey())) {
            throw new IllegalStateException("未配置微信支付公钥（app.wechat-pay.platform-public-key），无法验签回调");
        }
        try {
            byte[] keyBytes = Base64.getDecoder().decode(props.getPlatformPublicKey().replaceAll("\\s", ""));
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initVerify(key);
            s.update(message.getBytes(StandardCharsets.UTF_8));
            return s.verify(Base64.getDecoder().decode(signatureBase64));
        } catch (Exception e) {
            log.warn("微信回调验签异常", e);
            return false;
        }
    }

    private String decrypt(String associatedData, String nonce, String ciphertext) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            SecretKeySpec key = new SecretKeySpec(props.getApiV3Key().getBytes(StandardCharsets.UTF_8), "AES");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8)));
            cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(Base64.getDecoder().decode(ciphertext)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalArgumentException("微信回调解密失败，请检查 APIv3 密钥", e);
        }
    }

    private static OffsetDateTime parseTime(String rfc3339) {
        if (!StringUtils.hasText(rfc3339)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(rfc3339);
        } catch (Exception e) {
            return null;
        }
    }

    private static String nonce() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b).toUpperCase();
    }

    private void requireConfigured() {
        if (!StringUtils.hasText(props.getMchId()) || !StringUtils.hasText(props.getSerialNo())
                || !StringUtils.hasText(props.getPrivateKey()) || !StringUtils.hasText(props.getApiV3Key())
                || !StringUtils.hasText(appId)) {
            throw new IllegalStateException("未配置微信支付（app.wechat-pay.* 与 app.wechat.app-id）");
        }
    }
}
