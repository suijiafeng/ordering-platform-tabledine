package com.example.ordering.module.auth.dto;

public record CustomerLoginResponse(String token, long expiresIn, Long customerId) {
}
