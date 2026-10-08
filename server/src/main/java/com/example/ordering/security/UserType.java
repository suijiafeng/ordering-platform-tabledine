package com.example.ordering.security;

/**
 * 登录主体类型，对应 JWT audience。
 */
public enum UserType {
    /** 顾客，audience = customer */
    CUSTOMER("customer"),
    /** 员工，audience = merchant */
    STAFF("merchant");

    private final String audience;

    UserType(String audience) {
        this.audience = audience;
    }

    public String audience() {
        return audience;
    }

    public static UserType fromAudience(String aud) {
        for (UserType t : values()) {
            if (t.audience.equals(aud)) {
                return t;
            }
        }
        return null;
    }
}
