package com.example.ordering.module.member.dto;

import com.example.ordering.module.customer.entity.Customer;

import java.time.OffsetDateTime;

/** 会员（商家端视图）。balance 单位为分 */
public record MemberView(Long id, String phone, String name, long balance, boolean enabled, OffsetDateTime createdAt) {

    public static MemberView of(Customer c) {
        return new MemberView(c.getId(), c.getPhone(), c.getNickname(), c.getBalance() == null ? 0 : c.getBalance(),
                c.isEnabled(), c.getCreatedAt());
    }
}
