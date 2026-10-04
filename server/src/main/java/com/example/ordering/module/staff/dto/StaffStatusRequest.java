package com.example.ordering.module.staff.dto;

import jakarta.validation.constraints.NotNull;

public record StaffStatusRequest(@NotNull Boolean enabled) {
}
