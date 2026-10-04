package com.example.ordering.module.auth.client;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * 支付宝开放平台 RSA2（SHA256withRSA）请求签名。
 * 规则：除 sign 外的非空参数按 key 字典序排序，拼成 k1=v1&k2=v2，用应用私钥签名后 Base64。
 */
public final class AlipaySigner {

    private AlipaySigner() {
    }

    public static String content(Map<String, String> params) {
        return new TreeMap<>(params).entrySet().stream()
                .filter(e -> !"sign".equals(e.getKey()) && e.getValue() != null && !e.getValue().isEmpty())
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining("&"));
    }

    public static String sign(Map<String, String> params, String privateKeyBase64) {
        try {
            byte[] keyBytes = Base64.getDecoder().decode(privateKeyBase64.replaceAll("\\s", ""));
            PrivateKey privateKey = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey);
            signature.update(content(params).getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException("支付宝请求签名失败，请检查应用私钥（需 PKCS8 格式）", e);
        }
    }
}
