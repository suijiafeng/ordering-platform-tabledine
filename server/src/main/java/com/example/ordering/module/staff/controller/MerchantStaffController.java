package com.example.ordering.module.staff.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.staff.dto.ChangePasswordRequest;
import com.example.ordering.module.staff.dto.StaffCreateRequest;
import com.example.ordering.module.staff.dto.StaffStatusRequest;
import com.example.ordering.module.staff.dto.StaffUpdateRequest;
import com.example.ordering.module.staff.dto.StaffView;
import com.example.ordering.module.staff.service.StaffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 员工管理：仅店主；修改自己密码所有员工可用 */
@Tag(name = "商家端-员工")
@RestController
@RequestMapping("/api/v1/m/staff")
public class MerchantStaffController {

    private final StaffService staffService;

    public MerchantStaffController(StaffService staffService) {
        this.staffService = staffService;
    }

    @Operation(summary = "员工列表")
    @PreAuthorize("hasRole('OWNER')")
    @GetMapping
    public Result<List<StaffView>> list() {
        return Result.ok(staffService.list());
    }

    @Operation(summary = "新建店员账号")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping
    public Result<StaffView> create(@Valid @RequestBody StaffCreateRequest req) {
        return Result.ok(staffService.create(req));
    }

    @Operation(summary = "修改姓名 / 重置密码（重置后该员工需重新登录）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/{id}")
    public Result<StaffView> update(@PathVariable Long id, @Valid @RequestBody StaffUpdateRequest req) {
        return Result.ok(staffService.update(id, req));
    }

    @Operation(summary = "启用 / 停用（停用后该员工会话立即失效）")
    @PreAuthorize("hasRole('OWNER')")
    @PatchMapping("/{id}/status")
    public Result<StaffView> setStatus(@PathVariable Long id, @Valid @RequestBody StaffStatusRequest req) {
        return Result.ok(staffService.setEnabled(id, req.enabled()));
    }

    @Operation(summary = "修改自己的密码（成功后需重新登录）")
    @PutMapping("/me/password")
    public Result<Void> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        staffService.changeOwnPassword(req);
        return Result.ok();
    }
}
