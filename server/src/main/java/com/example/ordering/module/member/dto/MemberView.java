package com.example.ordering.module.member.dto;

import com.example.ordering.module.customer.entity.Customer;

import java.time.OffsetDateTime;

/**
 * 会员（商家端视图）。balance 单位为分。
 * 手机号是登录账号也是个人信息：商家端一律只返回脱敏号码（138****0001），店主也不例外；
 * 按完整手机号搜索仍然可用（搜索在服务端做）。
 */
public record MemberView(Long id, String phone, String name, long balance, boolean enabled, OffsetDateTime createdAt) {

    public static MemberView of(Customer c) {
        return new MemberView(c.getId(), maskPhone(c.getPhone()), c.getNickname(),
                c.getBalance() == null ? 0 : c.getBalance(), c.isEnabled(), c.getCreatedAt());
    }

    static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone;
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
