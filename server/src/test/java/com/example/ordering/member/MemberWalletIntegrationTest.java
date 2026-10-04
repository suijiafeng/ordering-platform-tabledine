package com.example.ordering.member;

import com.example.ordering.module.wallet.service.WalletService;
import com.example.ordering.support.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 会员账号与余额支付：商家建号 / 充值 → 会员密码登录 → 下单从余额扣费 → 取消订单余额返还；
 * 余额不足不下扣、不留支付单；资金操作仅店主；改密 / 停用后旧登录失效。
 */
class MemberWalletIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private WalletService walletService;
    @Autowired
    private org.springframework.transaction.PlatformTransactionManager txManager;

    private static String randomPhone() {
        return "138" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
    }

    @Test
    void merchantCreatesAndRechargesMember_memberPaysWithBalance_refundReturnsBalance() throws Exception {
        String owner = ownerToken();
        String staff = staffToken();
        String phone = randomPhone();

        // 建号 + 开户充值 50 元；店员无权建号 / 充值，可查看列表
        mvc.perform(authed(post("/api/v1/m/members"), staff).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "张三", "password", "pw123456")))
                .andExpect(status().isForbidden());
        MvcResult created = mvc.perform(authed(post("/api/v1/m/members"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "张三", "password", "pw123456", "initialAmount", 5000)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(5000))
                .andReturn();
        long memberId = data(created).path("id").asLong();
        // 手机号唯一
        mvc.perform(authed(post("/api/v1/m/members"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "李四", "password", "pw123456")))
                .andExpect(status().isConflict());
        mvc.perform(authed(post("/api/v1/m/members/" + memberId + "/recharge"), staff).contentType(MediaType.APPLICATION_JSON)
                        .content(json("amount", 3000))).andExpect(status().isForbidden());
        mvc.perform(authed(post("/api/v1/m/members/" + memberId + "/recharge"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("amount", 3000, "remark", "现金充值")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.balance").value(8000));
        mvc.perform(authed(get("/api/v1/m/members?keyword=" + phone), staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.list[0].phone").value(phone));
        JsonNode txns = getData("/api/v1/m/members/" + memberId + "/transactions", staff);
        assertThat(txns.path("total").asLong()).isEqualTo(2);
        assertThat(txns.path("list").get(0).path("type").asText()).isEqualTo("RECHARGE");
        assertThat(txns.path("list").get(0).path("balanceAfter").asLong()).isEqualTo(8000);

        // 会员登录：密码错误 40102；正确后 /c/me 返回余额
        mvc.perform(post("/api/v1/c/auth/password-login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "password", "wrong-pass")))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(40102));
        String member = memberLogin(phone, "pw123456");
        mvc.perform(authed(get("/api/v1/c/me"), member)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.member").value(true))
                .andExpect(jsonPath("$.data.phone").value(phone))
                .andExpect(jsonPath("$.data.balance").value(8000));

        // 下单 38 元 → 发起支付即从余额扣费并入账，订单直接待接单
        String orderNo = createOrder(member);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), member))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.channel").value("H5"))
                .andExpect(jsonPath("$.data.params.balance").value(true))
                .andExpect(jsonPath("$.data.params.paid").value(true));
        assertThat(orderStatus(orderNo)).isEqualTo("PAID");
        assertThat(balance(member)).isEqualTo(4200);
        assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE out_trade_no = ?", String.class, orderNo)).isEqualTo("SUCCESS");
        // 已支付订单再次发起支付：状态冲突，不会二次扣费
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/pay"), member)).andExpect(status().isConflict());
        assertThat(balance(member)).isEqualTo(4200);

        // 余额不足：第二单 38 元能付，第三单 38 元拒绝（42203），订单仍待支付、没有支付单、余额不变
        String orderNo2 = createOrder(member);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo2 + "/pay"), member)).andExpect(status().isOk());
        assertThat(balance(member)).isEqualTo(400);
        String orderNo3 = createOrder(member);
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo3 + "/pay"), member))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value(42203));
        assertThat(orderStatus(orderNo3)).isEqualTo("PENDING_PAY");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment p JOIN orders o ON o.id = p.order_id WHERE o.order_no = ?", Long.class, orderNo3)).isZero();
        assertThat(balance(member)).isEqualTo(400);

        // 待接单时顾客取消：自动全额退款走余额返还，立即成功
        mvc.perform(authed(post("/api/v1/c/orders/" + orderNo + "/cancel"), member)).andExpect(status().isOk());
        assertThat(orderStatus(orderNo)).isEqualTo("CANCELLED");
        JsonNode detail = getData("/api/v1/c/orders/" + orderNo, member);
        assertThat(detail.path("refundStatus").asText()).isEqualTo("FULL");
        assertThat(detail.path("refunds").get(0).path("status").asText()).isEqualTo("SUCCESS");
        assertThat(balance(member)).isEqualTo(4200);
        String refundNo = detail.path("refunds").get(0).path("refundNo").asText();
        // 同一退款单号重复返还：幂等，不再加钱
        Boolean refundedAgain = new org.springframework.transaction.support.TransactionTemplate(txManager)
                .execute(st -> walletService.refund(refundNo, orderNo, 3800));
        assertThat(refundedAgain).isFalse();
        assertThat(balance(member)).isEqualTo(4200);
        JsonNode myTxns = getData("/api/v1/c/wallet/transactions", member);
        assertThat(myTxns.path("list").get(0).path("type").asText()).isEqualTo("REFUND");
        assertThat(myTxns.path("list").get(0).path("credit").asBoolean()).isTrue();

        // 看板 / 导出：充值单独统计，导出的渠道显示「余额」
        mvc.perform(authed(get("/api/v1/m/dashboard/today"), owner)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rechargeAmount").value(org.hamcrest.Matchers.greaterThanOrEqualTo(8000)));
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        String csv = mvc.perform(authed(get("/api/v1/m/reports/export?from=" + today + "&to=" + today), owner))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).contains(orderNo).contains("余额");
    }

    @Test
    void passwordChangeAndDisableInvalidateOldSessions() throws Exception {
        String owner = ownerToken();
        String phone = randomPhone();
        long memberId = data(mvc.perform(authed(post("/api/v1/m/members"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("phone", phone, "name", "王五", "password", "pw123456"))).andReturn()).path("id").asLong();
        String token = memberLogin(phone, "pw123456");

        // 会员自己改密：旧 token 失效，新密码可登录
        mvc.perform(authed(put("/api/v1/c/me/password"), token).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", "bad", "newPassword", "newpass66")))
                .andExpect(status().isUnauthorized());
        mvc.perform(authed(put("/api/v1/c/me/password"), token).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", "pw123456", "newPassword", "newpass66")))
                .andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/c/me"), token)).andExpect(status().isUnauthorized());
        String token2 = memberLogin(phone, "newpass66");

        // 店主重置密码：同样让会话失效
        mvc.perform(authed(put("/api/v1/m/members/" + memberId), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("name", "王五五", "password", "reset888")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("王五五"));
        mvc.perform(authed(get("/api/v1/c/me"), token2)).andExpect(status().isUnauthorized());
        String token3 = memberLogin(phone, "reset888");

        // 停用：会话失效、不能登录；启用后恢复
        mvc.perform(authed(patch("/api/v1/m/members/" + memberId + "/status"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("enabled", false))).andExpect(status().isOk());
        mvc.perform(authed(get("/api/v1/c/me"), token3)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/c/auth/password-login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "password", "reset888")))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(40103));
        mvc.perform(authed(patch("/api/v1/m/members/" + memberId + "/status"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("enabled", true))).andExpect(status().isOk());
        memberLogin(phone, "reset888");

        // 原密码错误：拒绝修改
        String other = memberToken();
        mvc.perform(authed(put("/api/v1/c/me/password"), other).contentType(MediaType.APPLICATION_JSON)
                        .content(json("oldPassword", "wrong-pass", "newPassword", "newpass66")))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(40102));
        // 已停用的小程序登录留下的非会员顾客：商家端按 ID 找不到，不能充值
        jdbc.update("INSERT INTO customer (status) VALUES (1)");
        Long legacyId = jdbc.queryForObject("SELECT MAX(id) FROM customer WHERE phone IS NULL", Long.class);
        mvc.perform(authed(post("/api/v1/m/members/" + legacyId + "/recharge"), owner).contentType(MediaType.APPLICATION_JSON)
                .content(json("amount", 100))).andExpect(status().isNotFound());
    }


    @Test
    void rechargeWithSameRequestIdIsCreditedOnce() throws Exception {
        String owner = ownerToken();
        String phone = randomPhone();
        MvcResult created = mvc.perform(authed(post("/api/v1/m/members"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("phone", phone, "name", "幂等", "password", "pw123456")))
                .andExpect(status().isOk()).andReturn();
        long memberId = data(created).path("id").asLong();
        String requestId = UUID.randomUUID().toString();
        // 超时后重试 / 双击：同一请求号只入账一次
        for (int i = 0; i < 2; i++) {
            mvc.perform(authed(post("/api/v1/m/members/" + memberId + "/recharge"), owner).contentType(MediaType.APPLICATION_JSON)
                            .content(json("amount", 1000, "requestId", requestId)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.balance").value(1000));
        }
        // 新的请求号是一次新的充值
        mvc.perform(authed(post("/api/v1/m/members/" + memberId + "/recharge"), owner).contentType(MediaType.APPLICATION_JSON)
                        .content(json("amount", 1000, "requestId", UUID.randomUUID().toString())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.balance").value(2000));
    }

    @Test
    void memberCannotOrderAtAnotherStore() throws Exception {
        String member = memberToken();  // 门店 1 的会员
        Long otherStore = jdbc.queryForObject("INSERT INTO store (name) VALUES ('另一家店') RETURNING id", Long.class);
        String token = "other-store-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("INSERT INTO dining_table (store_id, code, qr_token) VALUES (?, 'B1', ?)", otherStore, token);
        Map<String, Object> item = Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1);
        mvc.perform(authed(post("/api/v1/c/orders"), member).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("clientRequestId", UUID.randomUUID().toString(), "qrToken", token,
                                "items", List.of(item), "peopleCount", 1))))
                .andExpect(status().isForbidden());
    }

    private long balance(String memberToken) throws Exception {
        return getData("/api/v1/c/me", memberToken).path("balance").asLong();
    }

    private String createOrder(String customer) throws Exception {
        Map<String, Object> item = Map.of("dishId", 1, "specItemIds", List.of(), "addonItemIds", List.of(), "quantity", 1);
        Map<String, Object> body = Map.of("clientRequestId", UUID.randomUUID().toString(), "qrToken", "dev-table-a1",
                "items", List.of(item), "peopleCount", 2);
        MvcResult r = mvc.perform(authed(post("/api/v1/c/orders"), customer)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk())
                .andReturn();
        return data(r).path("orderNo").asText();
    }

    private String orderStatus(String orderNo) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE order_no = ?", String.class, orderNo);
    }
}
