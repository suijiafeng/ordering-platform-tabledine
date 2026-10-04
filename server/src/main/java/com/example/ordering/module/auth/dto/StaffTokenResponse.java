package com.example.ordering.module.auth.dto;

/**
 * @param expiresIn        access token 剩余秒数
 * @param refreshExpiresIn refresh token 剩余秒数
 */
public record StaffTokenResponse(String accessToken, long expiresIn,
                                 String refreshToken, long refreshExpiresIn,
                                 StaffProfile staff) {
}
