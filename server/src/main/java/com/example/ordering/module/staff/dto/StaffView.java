package com.example.ordering.module.staff.dto;

import com.example.ordering.module.staff.entity.Staff;

import java.time.OffsetDateTime;

public record StaffView(Long id, String username, String name, String role, boolean enabled, OffsetDateTime createdAt) {

    public static StaffView of(Staff s) {
        return new StaffView(s.getId(), s.getUsername(), s.getName(), s.getRole(), s.isEnabled(), s.getCreatedAt());
    }
}
