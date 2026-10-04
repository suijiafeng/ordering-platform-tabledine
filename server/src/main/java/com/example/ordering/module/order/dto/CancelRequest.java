package com.example.ordering.module.order.dto;

import jakarta.validation.constraints.Size;

public record CancelRequest(@Size(max = 255, message = "原因最多 255 字") String reason) {
}
