package com.example.ordering.module.member.dto;

import com.example.ordering.module.customer.entity.Customer;

import java.time.OffsetDateTime;

/**
 * 会员（商家端视图）。balance 单位为分。
 * 手机号是登录账号也是个人信息：店主看完整号码（开户、重置密码需要核对），店员只看脱敏号码（138****0001），
 * 店员按手机号搜索仍然可用（搜索在服务端做）。
 */
public record MemberView(Long id, String phone, String name, long balance, boolean enabled, OffsetDateTime createdAt) {

    public static MemberView of(Customer c) {
        return of(c, true);
    }

    public static MemberView of(Customer c, boolean fullPhone) {
        return new MemberView(c.getId(), fullPhone ? c.getPhone() : maskPhone(c.getPhone()), c.getNickname(),
                c.getBalance() == null ? 0 : c.getBalance(), c.isEnabled(), c.getCreatedAt());
    }

    static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone;
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
