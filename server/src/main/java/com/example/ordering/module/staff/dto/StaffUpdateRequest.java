package com.example.ordering.module.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 修改员工资料；password 非空时重置密码，role 非空时调整前厅 / 后厨角色（两者都会让该员工已登录会话立即失效） */
public record StaffUpdateRequest(
        @NotBlank(message = "请输入姓名") @Size(max = 32, message = "姓名最多 32 字") String name,
        @Size(min = 6, max = 64, message = "密码长度 6~64 位") String password,
        @Pattern(regexp = "^(STAFF|KITCHEN)$", message = "角色只能是前厅或后厨") String role) {
}
