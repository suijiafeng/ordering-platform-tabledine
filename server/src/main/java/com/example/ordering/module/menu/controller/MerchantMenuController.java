package com.example.ordering.module.menu.controller;

import com.example.ordering.security.LoginUser;
import com.example.ordering.module.menu.service.CustomerMenuService;
import com.example.ordering.module.menu.dto.MenuView;
import com.example.ordering.common.PageResult;
import com.example.ordering.common.Result;
import com.example.ordering.module.menu.dto.CategoryRequest;
import com.example.ordering.module.menu.dto.CategoryView;
import com.example.ordering.module.menu.dto.DishDetail;
import com.example.ordering.module.menu.dto.DishSaveRequest;
import com.example.ordering.module.menu.dto.DishStatusRequest;
import com.example.ordering.module.menu.dto.DishView;
import com.example.ordering.module.menu.dto.SoldOutRequest;
import com.example.ordering.module.menu.dto.SortRequest;
import com.example.ordering.module.menu.dto.StockRequest;
import com.example.ordering.module.menu.service.MerchantMenuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 商家端菜单管理。
 * 权限：查看与沽清所有员工可用；其余维护操作仅店主。
 */
@Tag(name = "商家端-菜单")
@Validated
@RestController
@RequestMapping("/api/v1/m")
public class MerchantMenuController {

    private final MerchantMenuService menuService;
    private final CustomerMenuService customerMenuService;

    public MerchantMenuController(MerchantMenuService menuService, CustomerMenuService customerMenuService) {
        this.menuService = menuService;
        this.customerMenuService = customerMenuService;
    }

    @Operation(summary = "点单菜单（与顾客看到的一致：分类 + 菜品 + 规格 + 加料 + 售罄），前厅代客下单用")
    @PreAuthorize("!hasRole('KITCHEN')")
    @GetMapping("/menu")
    public Result<MenuView> orderingMenu() {
        return Result.ok(customerMenuService.menu(LoginUser.currentStaff().storeId()));
    }

    // ---------- 分类 ----------

    @Operation(summary = "分类列表")
    @GetMapping("/categories")
    public Result<List<CategoryView>> listCategories() {
        return Result.ok(menuService.listCategories());
    }

    @Operation(summary = "新建分类")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/categories")
    public Result<CategoryView> createCategory(@Valid @RequestBody CategoryRequest req) {
        return Result.ok(menuService.createCategory(req));
    }

    @Operation(summary = "修改分类")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/categories/{id}")
    public Result<CategoryView> updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
        return Result.ok(menuService.updateCategory(id, req));
    }

    @Operation(summary = "删除分类（分类下没有菜品时）")
    @PreAuthorize("hasRole('OWNER')")
    @DeleteMapping("/categories/{id}")
    public Result<Void> deleteCategory(@PathVariable Long id) {
        menuService.deleteCategory(id);
        return Result.ok();
    }

    @Operation(summary = "分类排序（按 ids 顺序）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/categories/sort")
    public Result<Void> sortCategories(@Valid @RequestBody SortRequest req) {
        menuService.sortCategories(req.ids());
        return Result.ok();
    }

    // ---------- 菜品 ----------

    @Operation(summary = "菜品列表")
    @GetMapping("/dishes")
    public Result<PageResult<DishView>> listDishes(@RequestParam(required = false) Long categoryId,
                                                   @RequestParam(required = false) String keyword,
                                                   @RequestParam(defaultValue = "1") @Min(1) long page,
                                                   @RequestParam(defaultValue = "20") @Min(1) @Max(200) long pageSize) {
        return Result.ok(menuService.listDishes(categoryId, keyword, page, pageSize));
    }

    @Operation(summary = "菜品详情（含规格、加料）")
    @GetMapping("/dishes/{id}")
    public Result<DishDetail> getDish(@PathVariable Long id) {
        return Result.ok(menuService.getDish(id));
    }

    @Operation(summary = "新建菜品")
    @PreAuthorize("hasRole('OWNER')")
    @PostMapping("/dishes")
    public Result<DishDetail> createDish(@Valid @RequestBody DishSaveRequest req) {
        return Result.ok(menuService.createDish(req));
    }

    @Operation(summary = "修改菜品（整体替换规格、加料）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/dishes/{id}")
    public Result<DishDetail> updateDish(@PathVariable Long id, @Valid @RequestBody DishSaveRequest req) {
        return Result.ok(menuService.updateDish(id, req));
    }

    @Operation(summary = "删除菜品")
    @PreAuthorize("hasRole('OWNER')")
    @DeleteMapping("/dishes/{id}")
    public Result<Void> deleteDish(@PathVariable Long id) {
        menuService.deleteDish(id);
        return Result.ok();
    }

    @Operation(summary = "上下架")
    @PreAuthorize("hasRole('OWNER')")
    @PatchMapping("/dishes/{id}/status")
    public Result<Void> updateStatus(@PathVariable Long id, @Valid @RequestBody DishStatusRequest req) {
        menuService.updateStatus(id, req.status());
        return Result.ok();
    }

    @Operation(summary = "沽清 / 恢复（前厅 / 店主；后厨只能查看菜品）")
    @PreAuthorize("!hasRole('KITCHEN')")
    @PatchMapping("/dishes/{id}/sold-out")
    public Result<Void> updateSoldOut(@PathVariable Long id, @Valid @RequestBody SoldOutRequest req) {
        menuService.updateSoldOut(id, req.soldOut());
        return Result.ok();
    }

    @Operation(summary = "设置每日限量库存（null 表示不限量）")
    @PreAuthorize("hasRole('OWNER')")
    @PutMapping("/dishes/{id}/stock")
    public Result<Void> updateStock(@PathVariable Long id, @Valid @RequestBody StockRequest req) {
        menuService.updateStock(id, req.stockQuantity());
        return Result.ok();
    }
}
