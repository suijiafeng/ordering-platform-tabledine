package com.example.ordering.module.table.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.table.dto.TableBatchRequest;
import com.example.ordering.module.table.dto.TableRequest;
import com.example.ordering.module.table.dto.TableView;
import com.example.ordering.module.table.service.TableService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 桌台管理：查看所有员工可用，维护仅店主 */
@Tag(name = "商家端-桌台")
@RestController
@RequestMapping("/api/v1/m/tables")
public class MerchantTableController {

    private final TableService tableService;

    public MerchantTableController(TableService tableService) {
        this.tableService = tableService;
    }

    @Operation(summary = "桌台列表（含桌码链接）")
    @GetMapping
    public Result<List<TableView>> list() {
        return Result.ok(tableService.list());
    }

    @Operation(summary = "新建桌台")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping
    public Result<TableView> create(@Valid @RequestBody TableRequest req) {
        return Result.ok(tableService.create(req));
    }

    @Operation(summary = "批量新建桌台（已存在的桌号跳过）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/batch")
    public Result<List<TableView>> createBatch(@Valid @RequestBody TableBatchRequest req) {
        return Result.ok(tableService.createBatch(req));
    }

    @Operation(summary = "修改桌台")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/{id}")
    public Result<TableView> update(@PathVariable Long id, @Valid @RequestBody TableRequest req) {
        return Result.ok(tableService.update(id, req));
    }

    @Operation(summary = "删除桌台")
    @PreAuthorize("hasRole('OWNER')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        tableService.delete(id);
        return Result.ok();
    }

    @Operation(summary = "重置桌码（旧码立即失效）")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/{id}/reset-qr")
    public Result<TableView> resetQr(@PathVariable Long id) {
        return Result.ok(tableService.resetQr(id));
    }
}
