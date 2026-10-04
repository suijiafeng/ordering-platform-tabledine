package com.example.ordering.module.staff.dto;

import jakarta.validation.constraints.NotNull;

public record StaffStatusRequest(@NotNull(message = "请指定启用或停用") Boolean enabled) {
}
