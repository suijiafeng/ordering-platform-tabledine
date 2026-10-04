package com.example.ordering.module.auth.dto;

import com.example.ordering.common.Platform;

public record CustomerLoginResponse(String token, long expiresIn, Long customerId, Platform platform) {
}
