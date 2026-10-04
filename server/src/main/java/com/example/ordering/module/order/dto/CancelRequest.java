package com.example.ordering.module.order.dto;

import jakarta.validation.constraints.Size;

public record CancelRequest(@Size(max = 200, message = "原因最多 200 字") String reason) {
}
