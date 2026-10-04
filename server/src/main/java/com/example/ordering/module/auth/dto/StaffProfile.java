package com.example.ordering.module.auth.dto;

import com.example.ordering.module.staff.entity.Staff;

public record StaffProfile(Long id, Long storeId, String username, String name, String role) {

    public static StaffProfile of(Staff s) {
        return new StaffProfile(s.getId(), s.getStoreId(), s.getUsername(), s.getName(), s.getRole());
    }
}
