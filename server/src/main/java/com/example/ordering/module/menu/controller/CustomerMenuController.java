package com.example.ordering.module.menu.controller;

import com.example.ordering.common.Result;
import com.example.ordering.module.menu.dto.MenuView;
import com.example.ordering.module.menu.service.CustomerMenuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "顾客端-菜单")
@RestController
public class CustomerMenuController {

    private final CustomerMenuService menuService;

    public CustomerMenuController(CustomerMenuService menuService) {
        this.menuService = menuService;
    }

    @Operation(summary = "完整菜单：分类 + 菜品 + 规格 + 加料 + 售罄状态")
    @GetMapping("/api/v1/c/stores/{storeId}/menu")
    public Result<MenuView> menu(@PathVariable Long storeId) {
        return Result.ok(menuService.menu(storeId));
    }
}
