package com.example.ordering.module.pay.controller;

import com.example.ordering.common.Platform;
import com.example.ordering.module.pay.channel.NotifyRequest;
import com.example.ordering.module.pay.channel.PayChannel;
import com.example.ordering.module.pay.channel.PayChannelRegistry;
import com.example.ordering.module.pay.channel.PayNotify;
import com.example.ordering.module.pay.channel.RefundNotify;
import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.refund.service.RefundService;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 渠道异步通知（公网，无需登录；验签失败返回失败应答，渠道会重试）。
 * 微信：JSON body + 签名头，应答 JSON；支付宝：form 参数，应答 success / fail 文本。
 */
@Hidden
@Slf4j
@RestController
@RequestMapping("/api/v1/pay/notify")
public class PayNotifyController {

    private final PayChannelRegistry channels;
    private final PayService payService;
    private final RefundService refundService;

    public PayNotifyController(PayChannelRegistry channels, PayService payService, RefundService refundService) {
        this.channels = channels;
        this.payService = payService;
        this.refundService = refundService;
    }

    @PostMapping(value = "/wechat", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> wechat(HttpServletRequest request, @RequestBody String body) {
        PayChannel channel = channels.get(Platform.WECHAT);
        try {
            PayNotify notify = channel.parsePayNotify(new NotifyRequest(headers(request), body, Map.of()));
            boolean ok = !notify.success()
                    || payService.onPaySuccess(notify.outTradeNo(), notify.transactionNo(), notify.amount(), notify.paidAt());
            return ack(channel, ok);
        } catch (IllegalArgumentException e) {
            log.warn("微信支付回调被拒绝: {}", e.getMessage());
            return ack(channel, false);
        } catch (RuntimeException e) {
            log.error("处理微信支付回调异常", e);
            return ack(channel, false);
        }
    }

    @PostMapping(value = "/wechat-refund", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> wechatRefund(HttpServletRequest request, @RequestBody String body) {
        PayChannel channel = channels.get(Platform.WECHAT);
        try {
            RefundNotify notify = channel.parseRefundNotify(new NotifyRequest(headers(request), body, Map.of()));
            if (notify != null) {
                refundService.onRefundNotify(notify.refundNo(), notify.result());
            }
            return ack(channel, true);
        } catch (IllegalArgumentException e) {
            log.warn("微信退款回调被拒绝: {}", e.getMessage());
            return ack(channel, false);
        } catch (RuntimeException e) {
            log.error("处理微信退款回调异常", e);
            return ack(channel, false);
        }
    }

    @PostMapping(value = "/alipay", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> alipay(@RequestParam Map<String, String> params) {
        PayChannel channel = channels.get(Platform.ALIPAY);
        try {
            PayNotify notify = channel.parsePayNotify(new NotifyRequest(Map.of(), null, params));
            boolean ok = !notify.success()
                    || payService.onPaySuccess(notify.outTradeNo(), notify.transactionNo(), notify.amount(), notify.paidAt());
            return ResponseEntity.ok(channel.notifyAck(ok));
        } catch (IllegalArgumentException e) {
            log.warn("支付宝回调被拒绝: {}", e.getMessage());
            return ResponseEntity.ok(channel.notifyAck(false));
        } catch (RuntimeException e) {
            log.error("处理支付宝回调异常", e);
            return ResponseEntity.ok(channel.notifyAck(false));
        }
    }

    private static ResponseEntity<String> ack(PayChannel channel, boolean ok) {
        // 微信：非 2xx 视为失败并重试
        return ResponseEntity.status(ok ? 200 : 500).body(channel.notifyAck(ok));
    }

    private static Map<String, String> headers(HttpServletRequest request) {
        Map<String, String> map = new HashMap<>();
        for (String name : Collections.list(request.getHeaderNames())) {
            map.put(name, request.getHeader(name));
        }
        return map;
    }
}
