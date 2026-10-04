package com.example.ordering.pay;

import com.example.ordering.common.BusinessException;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.pay.channel.PayQueryResult;
import com.example.ordering.module.pay.channel.WechatPayChannel;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 微信支付渠道：应答必须验签（查单「已支付」会直接入账） */
class WechatPayChannelTest {

    private final KeyPair merchant = FakeGateway.rsa();
    private final KeyPair wechat = FakeGateway.rsa();

    private WechatPayChannel channel(String apiBase) {
        AppProperties p = new AppProperties();
        p.getWechat().setAppId("wx1234567890");
        p.getWechatPay().setMchId("1900000001");
        p.getWechatPay().setSerialNo("SERIAL");
        p.getWechatPay().setPrivateKey(FakeGateway.b64(merchant.getPrivate().getEncoded()));
        p.getWechatPay().setApiV3Key("0123456789abcdef0123456789abcdef");
        p.getWechatPay().setPlatformPublicKeyId("PUB_KEY_ID_TEST");
        p.getWechatPay().setPlatformPublicKey(FakeGateway.b64(wechat.getPublic().getEncoded()));
        p.getWechatPay().setApiBase(apiBase);
        return new WechatPayChannel(p, new ObjectMapper());
    }

    private static final String PAID = "{\"trade_state\":\"SUCCESS\",\"transaction_id\":\"4200001\",\"amount\":{\"total\":3800},"
            + "\"success_time\":\"2026-10-04T12:00:00+08:00\",\"out_trade_no\":\"T1\"}";

    private FakeGateway.Resp signedBy(java.security.PrivateKey key, String serial, String body) {
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "n0nce";
        return new FakeGateway.Resp(200, body, Map.of(
                "Content-Type", "application/json",
                "Wechatpay-Timestamp", ts,
                "Wechatpay-Nonce", nonce,
                "Wechatpay-Serial", serial,
                "Wechatpay-Signature", FakeGateway.sign(key, ts + "\n" + nonce + "\n" + body + "\n")));
    }

    @Test
    void signedQueryResponseIsAccepted() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> signedBy(wechat.getPrivate(), "PUB_KEY_ID_TEST", PAID))) {
            PayQueryResult r = channel(gw.baseUrl()).queryPayment("T1");
            assertThat(r.state()).isEqualTo(PayQueryResult.State.SUCCESS);
            assertThat(r.amount()).isEqualTo(3800);
            // 查单路径带 mchid，且请求带了商户签名
            assertThat(gw.last.get().path()).isEqualTo("/v3/pay/transactions/out-trade-no/T1");
            assertThat(gw.last.get().query()).isEqualTo("mchid=1900000001");
        }
    }

    @Test
    void unsignedForgedOrWrongKeyResponsesAreRejected() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> new FakeGateway.Resp(200, PAID, Map.of("Content-Type", "application/json")))) {
            assertThatThrownBy(() -> channel(gw.baseUrl()).queryPayment("T1")).isInstanceOf(BusinessException.class);
        }
        try (FakeGateway gw = new FakeGateway(req -> signedBy(FakeGateway.rsa().getPrivate(), "PUB_KEY_ID_TEST", PAID))) {
            assertThatThrownBy(() -> channel(gw.baseUrl()).queryPayment("T1")).isInstanceOf(BusinessException.class);
        }
        try (FakeGateway gw = new FakeGateway(req -> signedBy(wechat.getPrivate(), "OTHER_KEY", PAID))) {
            assertThatThrownBy(() -> channel(gw.baseUrl()).queryPayment("T1")).isInstanceOf(BusinessException.class);
        }
    }

    @Test
    void missingAmountIsNotTreatedAsZeroMatch() throws Exception {
        String noAmount = "{\"trade_state\":\"SUCCESS\",\"transaction_id\":\"4200001\",\"out_trade_no\":\"T1\"}";
        try (FakeGateway gw = new FakeGateway(req -> signedBy(wechat.getPrivate(), "PUB_KEY_ID_TEST", noAmount))) {
            assertThat(channel(gw.baseUrl()).queryPayment("T1").amount()).isEqualTo(-1);
        }
    }

    @Test
    void refundNotFoundAllowsResubmission() throws Exception {
        try (FakeGateway gw = new FakeGateway(req -> new FakeGateway.Resp(404,
                "{\"code\":\"RESOURCE_NOT_EXISTS\",\"message\":\"退款单不存在\"}", Map.of("Content-Type", "application/json")))) {
            assertThat(channel(gw.baseUrl()).queryRefund("R1", "T1").state())
                    .isEqualTo(com.example.ordering.module.pay.channel.RefundResult.State.NOT_FOUND);
        }
    }
}
