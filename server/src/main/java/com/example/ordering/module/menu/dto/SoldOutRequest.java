package com.example.ordering.module.menu.dto;

import jakarta.validation.constraints.NotNull;

public record SoldOutRequest(@NotNull Boolean soldOut) {
}
