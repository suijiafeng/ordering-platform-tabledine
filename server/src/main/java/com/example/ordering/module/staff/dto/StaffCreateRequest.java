package com.example.ordering.module.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 新建员工账号：角色为 STAFF（前厅，默认）或 KITCHEN（后厨）；店主账号由系统初始化，不能在这里创建 */
public record StaffCreateRequest(
        @NotBlank(message = "请输入登录账号")
        @Pattern(regexp = "^[A-Za-z0-9_]{3,32}$", message = "账号为 3~32 位字母、数字或下划线") String username,
        @NotBlank(message = "请输入姓名") @Size(max = 32, message = "姓名最多 32 字") String name,
        @NotBlank(message = "请输入初始密码") @Size(min = 6, max = 64, message = "密码长度 6~64 位") String password,
        @Pattern(regexp = "^(STAFF|KITCHEN)$", message = "角色只能是前厅或后厨") String role) {
}
