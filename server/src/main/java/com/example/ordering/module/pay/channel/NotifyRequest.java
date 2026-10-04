package com.example.ordering.module.pay.channel;

import java.util.Map;

/**
 * 渠道回调原始请求：微信为 JSON body + 签名头；支付宝为 form 参数。
 */
public record NotifyRequest(Map<String, String> headers, String body, Map<String, String> formParams) {

    public String header(String name) {
        if (headers == null) {
            return null;
        }
        String v = headers.get(name);
        if (v != null) {
            return v;
        }
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey().equalsIgnoreCase(name)) {
                return e.getValue();
            }
        }
        return null;
    }
}
