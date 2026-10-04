package com.example.ordering.module.menu.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.menu.dto.AddonGroupView;
import com.example.ordering.module.menu.dto.SpecGroupView;
import com.example.ordering.module.menu.entity.AddonGroup;
import com.example.ordering.module.menu.entity.AddonItem;
import com.example.ordering.module.menu.entity.DishSpecGroup;
import com.example.ordering.module.menu.entity.DishSpecItem;
import com.example.ordering.module.menu.mapper.AddonGroupMapper;
import com.example.ordering.module.menu.mapper.AddonItemMapper;
import com.example.ordering.module.menu.mapper.DishSpecGroupMapper;
import com.example.ordering.module.menu.mapper.DishSpecItemMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 批量加载菜品的规格组 / 加料组（避免逐个菜品查询）。
 * 子表没有 store_id，调用方须保证 dishIds 已经过门店归属校验。
 */
@Component
public class MenuGroupLoader {

    private final DishSpecGroupMapper specGroupMapper;
    private final DishSpecItemMapper specItemMapper;
    private final AddonGroupMapper addonGroupMapper;
    private final AddonItemMapper addonItemMapper;

    public MenuGroupLoader(DishSpecGroupMapper specGroupMapper, DishSpecItemMapper specItemMapper,
                           AddonGroupMapper addonGroupMapper, AddonItemMapper addonItemMapper) {
        this.specGroupMapper = specGroupMapper;
        this.specItemMapper = specItemMapper;
        this.addonGroupMapper = addonGroupMapper;
        this.addonItemMapper = addonItemMapper;
    }

    public Map<Long, List<SpecGroupView>> loadSpecGroups(Collection<Long> dishIds) {
        if (dishIds.isEmpty()) {
            return Map.of();
        }
        List<DishSpecGroup> groups = specGroupMapper.selectList(Wrappers.<DishSpecGroup>lambdaQuery()
                .in(DishSpecGroup::getDishId, dishIds)
                .orderByAsc(DishSpecGroup::getSort, DishSpecGroup::getId));
        if (groups.isEmpty()) {
            return Map.of();
        }
        List<Long> groupIds = groups.stream().map(DishSpecGroup::getId).toList();
        Map<Long, List<DishSpecItem>> itemsByGroup = specItemMapper.selectList(Wrappers.<DishSpecItem>lambdaQuery()
                        .in(DishSpecItem::getGroupId, groupIds)
                        .orderByAsc(DishSpecItem::getSort, DishSpecItem::getId))
                .stream().collect(Collectors.groupingBy(DishSpecItem::getGroupId, LinkedHashMap::new, Collectors.toList()));

        Map<Long, List<SpecGroupView>> result = new LinkedHashMap<>();
        for (DishSpecGroup g : groups) {
            List<SpecGroupView.SpecItemView> items = itemsByGroup.getOrDefault(g.getId(), List.of()).stream()
                    .map(i -> new SpecGroupView.SpecItemView(i.getId(), i.getName(), zeroIfNull(i.getPriceDelta()),
                            Boolean.TRUE.equals(i.getIsDefault())))
                    .toList();
            result.computeIfAbsent(g.getDishId(), k -> new ArrayList<>())
                    .add(new SpecGroupView(g.getId(), g.getName(), Boolean.TRUE.equals(g.getRequired()), items));
        }
        return result;
    }

    public Map<Long, List<AddonGroupView>> loadAddonGroups(Collection<Long> dishIds) {
        if (dishIds.isEmpty()) {
            return Map.of();
        }
        List<AddonGroup> groups = addonGroupMapper.selectList(Wrappers.<AddonGroup>lambdaQuery()
                .in(AddonGroup::getDishId, dishIds)
                .orderByAsc(AddonGroup::getSort, AddonGroup::getId));
        if (groups.isEmpty()) {
            return Map.of();
        }
        List<Long> groupIds = groups.stream().map(AddonGroup::getId).toList();
        Map<Long, List<AddonItem>> itemsByGroup = addonItemMapper.selectList(Wrappers.<AddonItem>lambdaQuery()
                        .in(AddonItem::getGroupId, groupIds)
                        .orderByAsc(AddonItem::getSort, AddonItem::getId))
                .stream().collect(Collectors.groupingBy(AddonItem::getGroupId, LinkedHashMap::new, Collectors.toList()));

        Map<Long, List<AddonGroupView>> result = new LinkedHashMap<>();
        for (AddonGroup g : groups) {
            List<AddonGroupView.AddonItemView> items = itemsByGroup.getOrDefault(g.getId(), List.of()).stream()
                    .map(i -> new AddonGroupView.AddonItemView(i.getId(), i.getName(), zeroIfNull(i.getPriceDelta())))
                    .toList();
            int maxCount = g.getMaxCount() == null ? 1 : g.getMaxCount();
            result.computeIfAbsent(g.getDishId(), k -> new ArrayList<>())
                    .add(new AddonGroupView(g.getId(), g.getName(), maxCount, items));
        }
        return result;
    }

    private static long zeroIfNull(Long v) {
        return v == null ? 0L : v;
    }
}
