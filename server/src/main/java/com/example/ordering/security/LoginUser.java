package com.example.ordering.security;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 当前登录主体。
 *
 * @param type     顾客 / 员工
 * @param id       customerId 或 staffId
 * @param storeId  员工所属门店（顾客为空）
 * @param role     员工角色 OWNER / STAFF（顾客为空）
 * @param platform 顾客所在平台（员工为空）
 */
public record LoginUser(UserType type, Long id, Long storeId, String role, Platform platform) {

    public boolean isOwner() {
        return type == UserType.STAFF && "OWNER".equals(role);
    }

    /** 获取当前登录主体，未登录抛 40101 */
    public static LoginUser current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser user) {
            return user;
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }

    /** 获取当前登录主体，未登录返回 null */
    public static LoginUser currentOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser user) {
            return user;
        }
        return null;
    }

    public static LoginUser currentCustomer() {
        LoginUser user = current();
        if (user.type() != UserType.CUSTOMER) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return user;
    }

    public static LoginUser currentStaff() {
        LoginUser user = current();
        if (user.type() != UserType.STAFF) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return user;
    }
}
