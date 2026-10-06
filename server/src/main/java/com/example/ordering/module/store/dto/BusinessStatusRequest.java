package com.example.ordering.module.store.dto;

import jakarta.validation.constraints.NotNull;

public record BusinessStatusRequest(@NotNull Boolean open) {
}
