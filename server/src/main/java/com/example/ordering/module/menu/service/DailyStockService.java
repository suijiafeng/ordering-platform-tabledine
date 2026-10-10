package com.example.ordering.module.menu.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.menu.entity.Dish;
import com.example.ordering.module.menu.mapper.DishMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 每日限量的「今日剩余」重置。
 * <p>
 * dish.daily_stock = 店主设置的每日限量，dish.stock_quantity = 今日剩余，dish.stock_date = 剩余归属的业务日期。
 * 重置是幂等的：业务日期落后于今天的限量菜，把今日剩余重置为每日限量并推进日期。
 * 0 点定时任务、服务启动、下单前、顾客拉菜单时都会调用，停机错过 0 点也不会漏掉。
 * 作用于所有门店（无门店上下文时租户插件不过滤）。
 * <p>
 * 顾客端与商家端都依赖它，所以独立成服务，不挂在任何一端的菜单服务上。
 */
@Slf4j
@Service
public class DailyStockService {

    static final ZoneId STOCK_ZONE = ZoneId.of("Asia/Shanghai");

    private final DishMapper dishMapper;

    /** 本进程最近一次成功执行每日重置的业务日期 */
    private final AtomicReference<LocalDate> freshDate = new AtomicReference<>();

    public DailyStockService(DishMapper dishMapper) {
        this.dishMapper = dishMapper;
    }

    /** 今天的业务日期（上海时区） */
    public static LocalDate today() {
        return LocalDate.now(STOCK_ZONE);
    }

    /**
     * 确保今日剩余已按今天重置过。
     * 本进程当天已成功执行过就直接返回：顾客匿名拉菜单很频繁，不必每次都跑一条跨门店 UPDATE。
     * 在事务里调用时，等事务提交后才记为已执行（事务回滚则重置也回滚，下次还要再跑）。
     */
    public int ensureFresh() {
        if (today().equals(freshDate.get())) {
            return 0;
        }
        return refresh();
    }

    /** 不看本进程缓存，直接执行一次每日重置（0 点任务与启动时用） */
    public int refresh() {
        LocalDate today = today();
        int rows = dishMapper.update(null, Wrappers.<Dish>lambdaUpdate()
                .setSql("stock_quantity = daily_stock")
                .set(Dish::getStockDate, today)
                .isNotNull(Dish::getDailyStock)
                .and(q -> q.isNull(Dish::getStockDate).or().lt(Dish::getStockDate, today)));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    freshDate.set(today);
                }
            });
        } else {
            freshDate.set(today);
        }
        return rows;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resetOnStartup() {
        resetDaily();
    }

    /** 每天 0 点（Asia/Shanghai）把今日剩余重置为每日限量；所有门店（定时任务无门店上下文） */
    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Shanghai")
    public void resetDaily() {
        int rows = refresh();
        if (rows > 0) {
            log.info("已重置 {} 道菜的每日限量", rows);
        }
    }
}
