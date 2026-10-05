package com.example.ordering.module.member.dto;

import jakarta.validation.constraints.NotNull;

public record MemberStatusRequest(@NotNull Boolean enabled) {
}
