package com.example.ordering.module.auth.dto;

import com.example.ordering.common.Platform;

/**
 * 当前顾客信息。
 *
 * @param member  是否是会员账号（可用密码登录、有余额钱包）
 * @param phone   会员手机号（小程序顾客为空）
 * @param balance 账户余额（分；小程序顾客为 0）
 */
public record CustomerProfile(Long id, String nickname, String avatar, Platform platform,
                              boolean member, String phone, long balance) {
}
