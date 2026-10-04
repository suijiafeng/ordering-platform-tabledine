package com.example.ordering.module.auth.dto;

/**
 * 当前会员信息。
 *
 * @param member  是否是会员账号（目前只有会员能登录，恒为 true；保留给前端判断）
 * @param balance 账户余额（分）
 */
public record CustomerProfile(Long id, String nickname, boolean member, String phone, long balance) {
}
