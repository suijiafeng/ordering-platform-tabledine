package com.example.ordering.module.menu.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 新建 / 修改菜品（规格组、加料组随菜品整体保存）。金额单位：分。
 */
public record DishSaveRequest(
        @NotNull(message = "请选择分类") Long categoryId,
        @NotBlank(message = "请输入菜品名称") @Size(max = 64, message = "菜品名称最多 64 个字") String name,
        @Size(max = 255, message = "描述最多 255 个字") String description,
        @NotNull(message = "请输入价格") @Min(value = 0, message = "价格不能为负") @Max(value = 10_000_000, message = "价格过大") Long price,
        @Size(max = 255) String image,
        Integer sort,
        @Min(0) @Max(1) Integer status,
        @Valid @Size(max = 10, message = "规格组最多 10 个") List<SpecGroupInput> specGroups,
        @Valid @Size(max = 10, message = "加料组最多 10 个") List<AddonGroupInput> addonGroups
) {

    public record SpecGroupInput(
            @NotBlank(message = "请输入规格组名称") @Size(max = 32) String name,
            Boolean required,
            @NotEmpty(message = "规格组至少需要一个规格项") @Size(max = 20, message = "每组规格项最多 20 个")
            List<@Valid SpecItemInput> items
    ) {
    }

    public record SpecItemInput(
            @NotBlank(message = "请输入规格名称") @Size(max = 32) String name,
            @Min(value = -10_000_000) @Max(value = 10_000_000) Long priceDelta,
            Boolean isDefault
    ) {
    }

    public record AddonGroupInput(
            @NotBlank(message = "请输入加料组名称") @Size(max = 32) String name,
            @Min(value = 1, message = "最多可选数量至少为 1") Integer maxCount,
            @NotEmpty(message = "加料组至少需要一个加料项") @Size(max = 30, message = "每组加料项最多 30 个")
            List<@Valid AddonItemInput> items
    ) {
    }

    public record AddonItemInput(
            @NotBlank(message = "请输入加料名称") @Size(max = 32) String name,
            @Min(value = 0, message = "加料价格不能为负") @Max(value = 10_000_000) Long priceDelta
    ) {
    }
}
