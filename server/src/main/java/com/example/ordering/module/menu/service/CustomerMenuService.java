package com.example.ordering.module.menu.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.menu.dto.AddonGroupView;
import com.example.ordering.module.menu.dto.MenuView;
import com.example.ordering.module.menu.dto.SpecGroupView;
import com.example.ordering.module.menu.entity.Category;
import com.example.ordering.module.menu.entity.Dish;
import com.example.ordering.module.menu.mapper.CategoryMapper;
import com.example.ordering.module.menu.mapper.DishMapper;
import com.example.ordering.module.store.service.StoreService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 顾客端菜单。顾客请求没有门店上下文，这里显式按 store_id 过滤。
 * 只返回启用的分类和上架的菜品；没有菜品的分类不返回。
 */
@Service
public class CustomerMenuService {

    private final MerchantMenuService merchantMenuService;

    private final StoreService storeService;
    private final CategoryMapper categoryMapper;
    private final DishMapper dishMapper;
    private final MenuGroupLoader groupLoader;

    public CustomerMenuService(StoreService storeService, CategoryMapper categoryMapper,
                               DishMapper dishMapper, MenuGroupLoader groupLoader, MerchantMenuService merchantMenuService) {
        this.merchantMenuService = merchantMenuService;
        this.storeService = storeService;
        this.categoryMapper = categoryMapper;
        this.dishMapper = dishMapper;
        this.groupLoader = groupLoader;
    }

    public MenuView menu(Long storeId) {
        storeService.getRequired(storeId);
        merchantMenuService.ensureStockFresh();  // 错过 0 点重置时，顾客看到的售罄状态也要正确
        List<Category> categories = categoryMapper.selectList(Wrappers.<Category>lambdaQuery()
                .eq(Category::getStoreId, storeId)
                .eq(Category::getStatus, Category.STATUS_ENABLED)
                .orderByAsc(Category::getSort, Category::getId));
        List<Dish> dishes = dishMapper.selectList(Wrappers.<Dish>lambdaQuery()
                .eq(Dish::getStoreId, storeId)
                .eq(Dish::getStatus, Dish.STATUS_ON_SHELF)
                .orderByAsc(Dish::getSort, Dish::getId));

        List<Long> dishIds = dishes.stream().map(Dish::getId).toList();
        Map<Long, List<SpecGroupView>> specs = groupLoader.loadSpecGroups(dishIds);
        Map<Long, List<AddonGroupView>> addons = groupLoader.loadAddonGroups(dishIds);
        Map<Long, List<Dish>> byCategory = dishes.stream().collect(Collectors.groupingBy(Dish::getCategoryId));

        List<MenuView.MenuCategory> result = new ArrayList<>();
        for (Category c : categories) {
            List<Dish> list = byCategory.get(c.getId());
            if (list == null || list.isEmpty()) {
                continue;
            }
            List<MenuView.MenuDish> menuDishes = list.stream().map(d -> new MenuView.MenuDish(
                    d.getId(), d.getName(), d.getDescription(), d.getPrice(), d.getImage(), d.soldOutForCustomer(),
                    d.getStockQuantity() == null ? null : Math.max(0, d.getStockQuantity()),
                    specs.getOrDefault(d.getId(), List.of()),
                    addons.getOrDefault(d.getId(), List.of()))).toList();
            result.add(new MenuView.MenuCategory(c.getId(), c.getName(), menuDishes));
        }
        return new MenuView(storeId, result);
    }
}
