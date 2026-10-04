package com.example.ordering.pay;

import com.example.ordering.common.BusinessException;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.pay.channel.AlipayChannel;
import com.example.ordering.module.pay.channel.PayCreateRequest;
import com.example.ordering.module.pay.channel.RefundResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.time.OffsetDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 支付宝渠道：对本地假网关真实组装请求、签名、验签 */
class AlipayChannelTest {

    private final ObjectMapper om = new ObjectMapper();
    private final KeyPair app = FakeGateway.rsa();      // 商户应用密钥
    private final KeyPair alipay = FakeGateway.rsa();   // 「支付宝」密钥

    private AlipayChannel channel(String gateway) {
        AppProperties p = new AppProperties();
        p.getAlipay().setAppId("2021000000000001");
        p.getAlipay().setPrivateKey(FakeGateway.b64(app.getPrivate().getEncoded()));
        p.getAlipay().setAlipayPublicKey(FakeGateway.b64(alipay.getPublic().getEncoded()));
        p.getAlipay().setGateway(gateway);
        return new AlipayChannel(p, om);
    }

    /** 按支付宝规则签名应答：对 xxx_response 节点原文签名 */
    private FakeGateway.Resp signed(String nodeName, String nodeJson) {
        String body = "{\"" + nodeName + "\":" + nodeJson + ",\"sign\":\"" + FakeGateway.sign(alipay.getPrivate(), nodeJson) + "\"}";
        return new FakeGateway.Resp(200, body, Map.of("Content-Type", "application/json"));
    }

    private static Map<String, String> parseQuery(String raw) {
        Map<String, String> m = new java.util.HashMap<>();
        for (String kv : raw.split("&")) {
            int i = kv.indexOf('=');
            m.put(kv.substring(0, i), URLDecoder.decode(kv.substring(i + 1), StandardCharsets.UTF_8));
        }
        return m;
    }

    @Test
    void createPaymentPutsSystemParamsInUrlAndUsesJsapiProduct() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> signed("alipay_trade_create_response",
                "{\"code\":\"10000\",\"msg\":\"Success\",\"trade_no\":\"2026100422001\",\"out_trade_no\":\"T1\"}"))) {
            Map<String, Object> params = channel(gw.baseUrl() + "/gateway.do").createPayment(new PayCreateRequest(
                    "T1", 1234, "小馆子 桌号A1", "2088123412341234", OffsetDateTime.now().plusMinutes(15), "https://x/notify"));
            assertThat(params).containsEntry("tradeNO", "2026100422001");

            FakeGateway.Req req = gw.last.get();
            Map<String, String> q = parseQuery(req.query());
            // 系统参数（charset、sign 等）在 URL 上；表单体只有 biz_content
            assertThat(q).containsEntry("charset", "utf-8").containsEntry("method", "alipay.trade.create").containsKey("sign");
            assertThat(q).doesNotContainKey("biz_content");
            Map<String, String> form = parseQuery(req.body());
            assertThat(form).containsOnlyKeys("biz_content");
            JsonNode biz = om.readTree(form.get("biz_content"));
            assertThat(biz.path("product_code").asText()).isEqualTo("JSAPI_PAY");
            assertThat(biz.path("total_amount").asText()).isEqualTo("12.34");
            // 2088 开头的是 user_id，必须放 buyer_id
            assertThat(biz.has("buyer_id")).isTrue();
            assertThat(biz.has("buyer_open_id")).isFalse();
            assertThat(biz.path("subject").asText()).isEqualTo("小馆子 桌号A1");
        }
    }

    @Test
    void openIdGoesToBuyerOpenId() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> signed("alipay_trade_create_response",
                "{\"code\":\"10000\",\"trade_no\":\"X\"}"))) {
            channel(gw.baseUrl()).createPayment(new PayCreateRequest("T2", 100, "店", "074a1CcTG1LelxKe4xQC0zgNdId0nxi95b5lsNpazWYoCo5",
                    OffsetDateTime.now().plusMinutes(15), null));
            JsonNode biz = om.readTree(parseQuery(gw.last.get().body()).get("biz_content"));
            assertThat(biz.has("buyer_open_id")).isTrue();
            assertThat(biz.has("buyer_id")).isFalse();
        }
    }

    @Test
    void forgedOrUnsignedResponseIsRejected() throws Exception {
        String node = "{\"code\":\"10000\",\"trade_status\":\"TRADE_SUCCESS\",\"trade_no\":\"X\",\"total_amount\":\"0.01\"}";
        // 用别人的私钥签：验签失败
        String forged = "{\"alipay_trade_query_response\":" + node + ",\"sign\":\"" + FakeGateway.sign(FakeGateway.rsa().getPrivate(), node) + "\"}";
        try (FakeGateway gw = new FakeGateway(req -> new FakeGateway.Resp(200, forged, Map.of()))) {
            assertThatThrownBy(() -> channel(gw.baseUrl()).queryPayment("T3")).isInstanceOf(BusinessException.class);
        }
        String unsigned = "{\"alipay_trade_query_response\":" + node + "}";
        try (FakeGateway gw = new FakeGateway(req -> new FakeGateway.Resp(200, unsigned, Map.of()))) {
            assertThatThrownBy(() -> channel(gw.baseUrl()).queryPayment("T3")).isInstanceOf(BusinessException.class);
        }
    }

    @Test
    void refundQueryWithoutStatusMeansNotReceived() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> signed("alipay_trade_fastpay_refund_query_response",
                "{\"code\":\"10000\",\"msg\":\"Success\",\"out_trade_no\":\"T4\"}"))) {
            assertThat(channel(gw.baseUrl()).queryRefund("R1", "T4").state()).isEqualTo(RefundResult.State.NOT_FOUND);
        }
        try (FakeGateway gw = new FakeGateway(req -> signed("alipay_trade_fastpay_refund_query_response",
                "{\"code\":\"10000\",\"refund_status\":\"REFUND_SUCCESS\",\"trade_no\":\"X\"}"))) {
            assertThat(channel(gw.baseUrl()).queryRefund("R1", "T4").state()).isEqualTo(RefundResult.State.SUCCESS);
        }
    }

    @Test
    void missingPublicKeyMeansNotConfigured() {
        AppProperties p = new AppProperties();
        p.getAlipay().setAppId("2021000000000001");
        p.getAlipay().setPrivateKey(FakeGateway.b64(app.getPrivate().getEncoded()));
        assertThatThrownBy(() -> new AlipayChannel(p, om).queryPayment("T5")).isInstanceOf(IllegalStateException.class);
    }
}
