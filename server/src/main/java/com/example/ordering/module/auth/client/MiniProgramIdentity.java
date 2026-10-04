package com.example.ordering.module.auth.client;

/**
 * 小程序平台返回的用户身份。
 *
 * @param openId  微信 openid / 支付宝 open_id（老应用为 user_id）
 * @param unionId 微信 unionid（可空）
 */
public record MiniProgramIdentity(String openId, String unionId) {
}
