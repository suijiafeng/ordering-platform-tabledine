package com.example.ordering.module.member.dto;

import jakarta.validation.constraints.Size;

/**
 * 修改会员：姓名；password 非空时重置密码（该会员需重新登录）
 */
public record MemberUpdateRequest(@Size(max = 64) String name,
                                  @Size(min = 6, max = 64, message = "密码长度 6~64 位") String password) {
}
