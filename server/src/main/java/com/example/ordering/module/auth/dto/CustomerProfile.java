package com.example.ordering.module.auth.dto;

import com.example.ordering.common.Platform;

public record CustomerProfile(Long id, String nickname, String avatar, Platform platform) {
}
