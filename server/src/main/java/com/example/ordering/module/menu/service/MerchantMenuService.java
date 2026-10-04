package com.example.ordering.module.menu.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.menu.dto.CategoryRequest;
import com.example.ordering.module.menu.dto.CategoryView;
import com.example.ordering.module.menu.dto.DishDetail;
import com.example.ordering.module.menu.dto.DishSaveRequest;
import com.example.ordering.module.menu.dto.DishView;
import com.example.ordering.module.menu.entity.AddonGroup;
import com.example.ordering.module.menu.entity.AddonItem;
import com.example.ordering.module.menu.entity.Category;
import com.example.ordering.module.menu.entity.Dish;
import com.example.ordering.module.menu.entity.DishSpecGroup;
import com.example.ordering.module.menu.entity.DishSpecItem;
import com.example.ordering.module.menu.mapper.AddonGroupMapper;
import com.example.ordering.module.menu.mapper.AddonItemMapper;
import com.example.ordering.module.menu.mapper.CategoryMapper;
import com.example.ordering.module.menu.mapper.DishMapper;
import com.example.ordering.module.menu.mapper.DishSpecGroupMapper;
import com.example.ordering.module.menu.mapper.DishSpecItemMapper;
import com.example.ordering.security.LoginUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 商家端菜单管理。
 * 商家请求带门店上下文，category / dish 的查询与更新由多租户插件自动限定在当前门店；
 * 跨店访问会表现为「不存在」。
 */
@Service
public class MerchantMenuService {

    private final CategoryMapper categoryMapper;
    private final DishMapper dishMapper;
    private final DishSpecGroupMapper specGroupMapper;
    private final DishSpecItemMapper specItemMapper;
    private final AddonGroupMapper addonGroupMapper;
    private final AddonItemMapper addonItemMapper;
    private final MenuGroupLoader groupLoader;

    public MerchantMenuService(CategoryMapper categoryMapper, DishMapper dishMapper,
                               DishSpecGroupMapper specGroupMapper, DishSpecItemMapper specItemMapper,
                               AddonGroupMapper addonGroupMapper, AddonItemMapper addonItemMapper,
                               MenuGroupLoader groupLoader) {
        this.categoryMapper = categoryMapper;
        this.dishMapper = dishMapper;
        this.specGroupMapper = specGroupMapper;
        this.specItemMapper = specItemMapper;
        this.addonGroupMapper = addonGroupMapper;
        this.addonItemMapper = addonItemMapper;
        this.groupLoader = groupLoader;
    }

    // ==================== 分类 ====================

    public List<CategoryView> listCategories() {
        return categoryMapper.selectList(Wrappers.<Category>lambdaQuery()
                        .orderByAsc(Category::getSort, Category::getId))
                .stream().map(CategoryView::of).toList();
    }

    public CategoryView createCategory(CategoryRequest req) {
        Category c = new Category();
        c.setStoreId(LoginUser.currentStaff().storeId());
        c.setName(req.name().trim());
        c.setSort(req.sort() != null ? req.sort() : nextCategorySort());
        c.setStatus(req.status() != null ? req.status() : 1);
        categoryMapper.insert(c);
        return CategoryView.of(c);
    }

    public CategoryView updateCategory(Long id, CategoryRequest req) {
        Category c = requireCategory(id);
        c.setName(req.name().trim());
        if (req.sort() != null) {
            c.setSort(req.sort());
        }
        if (req.status() != null) {
            c.setStatus(req.status());
        }
        categoryMapper.updateById(c);
        return CategoryView.of(c);
    }

    public void deleteCategory(Long id) {
        requireCategory(id);
        Long dishCount = dishMapper.selectCount(Wrappers.<Dish>lambdaQuery().eq(Dish::getCategoryId, id));
        if (dishCount != null && dishCount > 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "分类下还有菜品，请先移走或删除菜品");
        }
        categoryMapper.deleteById(id);
    }

    @Transactional
    public void sortCategories(List<Long> ids) {
        for (int i = 0; i < ids.size(); i++) {
            Category c = new Category();
            c.setId(ids.get(i));
            c.setSort(i + 1);
            categoryMapper.updateById(c); // 多租户插件保证只能改到本店分类
        }
    }

    // ==================== 菜品 ====================

    public PageResult<DishView> listDishes(Long categoryId, String keyword, long page, long pageSize) {
        Page<Dish> p = dishMapper.selectPage(Page.of(page, pageSize), Wrappers.<Dish>lambdaQuery()
                .eq(categoryId != null, Dish::getCategoryId, categoryId)
                .like(StringUtils.hasText(keyword), Dish::getName, keyword == null ? null : keyword.trim())
                .orderByAsc(Dish::getSort, Dish::getId));
        return PageResult.of(p, DishView::of);
    }

    public DishDetail getDish(Long id) {
        Dish dish = requireDish(id);
        List<Long> ids = List.of(id);
        return new DishDetail(DishView.of(dish),
                groupLoader.loadSpecGroups(ids).getOrDefault(id, List.of()),
                groupLoader.loadAddonGroups(ids).getOrDefault(id, List.of()));
    }

    @Transactional
    public DishDetail createDish(DishSaveRequest req) {
        validateGroups(req);
        requireCategory(req.categoryId());
        Dish dish = new Dish();
        dish.setStoreId(LoginUser.currentStaff().storeId());
        applyBasic(dish, req);
        dish.setSort(req.sort() != null ? req.sort() : 0);
        dish.setStatus(req.status() != null ? req.status() : Dish.STATUS_ON_SHELF);
        dish.setIsSoldOut(false);
        dishMapper.insert(dish);
        saveGroups(dish.getId(), req);
        return getDish(dish.getId());
    }

    /** 整体替换：基础信息 + 规格组 + 加料组。历史订单使用明细快照，不受影响 */
    @Transactional
    public DishDetail updateDish(Long id, DishSaveRequest req) {
        validateGroups(req);
        Dish dish = requireDish(id);
        requireCategory(req.categoryId());
        // 定向更新基础字段：整行 updateById 会把读到的旧库存写回，覆盖期间顾客下单扣减的库存（超卖）
        var w = Wrappers.<Dish>lambdaUpdate()
                .set(Dish::getCategoryId, req.categoryId())
                .set(Dish::getName, req.name().trim())
                .set(Dish::getDescription, StringUtils.hasText(req.description()) ? req.description().trim() : null)
                .set(Dish::getPrice, req.price())
                .set(Dish::getImage, StringUtils.hasText(req.image()) ? req.image().trim() : null)
                .set(Dish::getUpdatedAt, java.time.OffsetDateTime.now())
                .eq(Dish::getId, dish.getId());
        if (req.sort() != null) {
            w.set(Dish::getSort, req.sort());
        }
        if (req.status() != null) {
            w.set(Dish::getStatus, req.status());
        }
        dishMapper.update(null, w);
        removeGroups(id);
        saveGroups(id, req);
        return getDish(id);
    }

    @Transactional
    public void deleteDish(Long id) {
        requireDish(id);
        dishMapper.deleteById(id);
        removeGroups(id);
    }

    public void updateStatus(Long id, int status) {
        requireDish(id);
        dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                .set(Dish::getStatus, status).set(Dish::getUpdatedAt, java.time.OffsetDateTime.now()).eq(Dish::getId, id));
    }

    public void updateSoldOut(Long id, boolean soldOut) {
        requireDish(id);
        dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                .set(Dish::getIsSoldOut, soldOut).set(Dish::getUpdatedAt, java.time.OffsetDateTime.now()).eq(Dish::getId, id));
    }

    /**
     * 设置每日限量；null 取消限量。
     * 今日剩余 = 新限量 − 今日已占用（原限量 − 原剩余）：中午把 10 改成 12 时已卖 5 份，剩余应是 7 而不是 12。
     */
    public void updateStock(Long id, Integer dailyStock) {
        requireDish(id);
        var w = Wrappers.<Dish>lambdaUpdate()
                .set(Dish::getUpdatedAt, java.time.OffsetDateTime.now())
                .eq(Dish::getId, id);
        if (dailyStock == null) {
            w.set(Dish::getDailyStock, null).set(Dish::getStockQuantity, null);
        } else {
            ensureStockFresh();  // 先把可能错过的 0 点重置补上，再按今日已占用重算
            w.setSql("stock_quantity = GREATEST(0, " + dailyStock + " - (COALESCE(daily_stock, 0) - COALESCE(stock_quantity, 0)))")
                    .set(Dish::getDailyStock, dailyStock)
                    .set(Dish::getStockDate, java.time.LocalDate.now(STOCK_ZONE));
        }
        dishMapper.update(null, w);
    }

    static final java.time.ZoneId STOCK_ZONE = java.time.ZoneId.of("Asia/Shanghai");

    /**
     * 幂等的每日重置：业务日期落后于今天的限量菜，把今日剩余重置为每日限量并推进日期。
     * 0 点定时任务、服务启动、下单前、顾客拉菜单时都会调用，停机错过 0 点也不会漏掉。
     * 所有门店（无门店上下文时租户插件不过滤）。
     * <p>本进程当天已成功执行过就直接返回：顾客匿名拉菜单很频繁，不必每次都跑一条跨门店 UPDATE。
     * 在事务里调用时，等事务提交后才记为已执行（事务回滚则重置也回滚，下次还要再跑）。
     */
    public int ensureStockFresh() {
        if (java.time.LocalDate.now(STOCK_ZONE).equals(stockFreshDate.get())) {
            return 0;
        }
        return refreshDailyStock();
    }

    /** 不看本进程缓存，直接执行一次每日重置（0 点任务与启动时用） */
    private int refreshDailyStock() {
        java.time.LocalDate today = java.time.LocalDate.now(STOCK_ZONE);
        int rows = dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                .setSql("stock_quantity = daily_stock")
                .set(Dish::getStockDate, today)
                .isNotNull(Dish::getDailyStock)
                .and(q -> q.isNull(Dish::getStockDate).or().lt(Dish::getStockDate, today)));
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            stockFreshDate.set(today);
                        }
                    });
        } else {
            stockFreshDate.set(today);
        }
        return rows;
    }

    /** 本进程最近一次成功执行每日重置的业务日期 */
    private final java.util.concurrent.atomic.AtomicReference<java.time.LocalDate> stockFreshDate =
            new java.util.concurrent.atomic.AtomicReference<>();

    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void resetDailyStockOnStartup() {
        resetDailyStock();
    }

    /** 每天 0 点（Asia/Shanghai）把今日剩余重置为每日限量；所有门店（定时任务无门店上下文） */
    @org.springframework.scheduling.annotation.Scheduled(cron = "0 0 0 * * *", zone = "Asia/Shanghai")
    public void resetDailyStock() {
        int rows = refreshDailyStock();
        if (rows > 0) {
            org.slf4j.LoggerFactory.getLogger(MerchantMenuService.class).info("已重置 {} 道菜的每日限量", rows);
        }
    }

    // ==================== 内部方法 ====================

    private void applyBasic(Dish dish, DishSaveRequest req) {
        dish.setCategoryId(req.categoryId());
        dish.setName(req.name().trim());
        dish.setDescription(StringUtils.hasText(req.description()) ? req.description().trim() : null);
        dish.setPrice(req.price());
        dish.setImage(StringUtils.hasText(req.image()) ? req.image().trim() : null);
    }

    static void validateGroups(DishSaveRequest req) {
        // 任意合法选择下单价都必须 ≥ 1 分：负价规格会让订单总额变负（违反约束 500）或抵扣其他菜品，
        // 0 元订单渠道不受理（永远无法支付且占着库存）。加料价不能为负，只需看规格组的最低加价
        long minUnit = req.price();
        if (req.specGroups() != null) {
            for (DishSaveRequest.SpecGroupInput g : req.specGroups()) {
                long minDelta = g.items().stream().mapToLong(i -> i.priceDelta() == null ? 0 : i.priceDelta()).min().orElse(0);
                boolean required = g.required() == null || g.required();
                minUnit += required ? minDelta : Math.min(0, minDelta);
            }
        }
        if (minUnit < 1) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "菜品最低售价（基础价 + 最便宜的规格）必须大于 0");
        }
        if (req.specGroups() != null) {
            for (DishSaveRequest.SpecGroupInput g : req.specGroups()) {
                long defaults = g.items().stream().filter(i -> Boolean.TRUE.equals(i.isDefault())).count();
                if (defaults > 1) {
                    throw new BusinessException(ErrorCode.PARAM_INVALID, "规格组「" + g.name() + "」只能有一个默认项");
                }
            }
        }
        if (req.addonGroups() != null) {
            for (DishSaveRequest.AddonGroupInput g : req.addonGroups()) {
                int max = g.maxCount() == null ? 1 : g.maxCount();
                if (max > g.items().size()) {
                    throw new BusinessException(ErrorCode.PARAM_INVALID,
                            "加料组「" + g.name() + "」最多可选数量不能超过加料项数量");
                }
            }
        }
    }

    private void saveGroups(Long dishId, DishSaveRequest req) {
        if (req.specGroups() != null) {
            int gSort = 0;
            for (DishSaveRequest.SpecGroupInput in : req.specGroups()) {
                DishSpecGroup g = new DishSpecGroup();
                g.setDishId(dishId);
                g.setName(in.name().trim());
                g.setRequired(in.required() == null || in.required());
                g.setSort(++gSort);
                specGroupMapper.insert(g);
                int iSort = 0;
                for (DishSaveRequest.SpecItemInput itemIn : in.items()) {
                    DishSpecItem item = new DishSpecItem();
                    item.setGroupId(g.getId());
                    item.setName(itemIn.name().trim());
                    item.setPriceDelta(itemIn.priceDelta() == null ? 0L : itemIn.priceDelta());
                    item.setIsDefault(Boolean.TRUE.equals(itemIn.isDefault()));
                    item.setSort(++iSort);
                    specItemMapper.insert(item);
                }
            }
        }
        if (req.addonGroups() != null) {
            int gSort = 0;
            for (DishSaveRequest.AddonGroupInput in : req.addonGroups()) {
                AddonGroup g = new AddonGroup();
                g.setDishId(dishId);
                g.setName(in.name().trim());
                g.setMaxCount(in.maxCount() == null ? 1 : in.maxCount());
                g.setSort(++gSort);
                addonGroupMapper.insert(g);
                int iSort = 0;
                for (DishSaveRequest.AddonItemInput itemIn : in.items()) {
                    AddonItem item = new AddonItem();
                    item.setGroupId(g.getId());
                    item.setName(itemIn.name().trim());
                    item.setPriceDelta(itemIn.priceDelta() == null ? 0L : itemIn.priceDelta());
                    item.setSort(++iSort);
                    addonItemMapper.insert(item);
                }
            }
        }
    }

    /** 软删除菜品下的全部规格组 / 加料组及其子项 */
    private void removeGroups(Long dishId) {
        List<Long> specGroupIds = specGroupMapper.selectList(Wrappers.<DishSpecGroup>lambdaQuery()
                .select(DishSpecGroup::getId).eq(DishSpecGroup::getDishId, dishId))
                .stream().map(DishSpecGroup::getId).toList();
        if (!specGroupIds.isEmpty()) {
            specItemMapper.delete(Wrappers.<DishSpecItem>lambdaQuery().in(DishSpecItem::getGroupId, specGroupIds));
            specGroupMapper.delete(Wrappers.<DishSpecGroup>lambdaQuery().in(DishSpecGroup::getId, specGroupIds));
        }
        List<Long> addonGroupIds = addonGroupMapper.selectList(Wrappers.<AddonGroup>lambdaQuery()
                .select(AddonGroup::getId).eq(AddonGroup::getDishId, dishId))
                .stream().map(AddonGroup::getId).toList();
        if (!addonGroupIds.isEmpty()) {
            addonItemMapper.delete(Wrappers.<AddonItem>lambdaQuery().in(AddonItem::getGroupId, addonGroupIds));
            addonGroupMapper.delete(Wrappers.<AddonGroup>lambdaQuery().in(AddonGroup::getId, addonGroupIds));
        }
    }

    private int nextCategorySort() {
        Long count = categoryMapper.selectCount(null);
        return count == null ? 1 : count.intValue() + 1;
    }

    private Category requireCategory(Long id) {
        Category c = id == null ? null : categoryMapper.selectById(id);
        if (c == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "分类不存在");
        }
        return c;
    }

    private Dish requireDish(Long id) {
        Dish d = id == null ? null : dishMapper.selectById(id);
        if (d == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "菜品不存在");
        }
        return d;
    }
}
