package com.example.ordering.tenant;

/**
 * 当前请求的门店上下文（商家端由 JWT 中的门店 ID 注入，请求结束时清理）。
 * <p>
 * 顾客端请求、定时任务、支付回调不设置门店上下文，多租户插件对其不生效，
 * 这些场景需要在业务代码中显式按 store_id 过滤。
 */
public final class StoreContext {

    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();

    private StoreContext() {
    }

    public static void set(Long storeId) {
        CURRENT.set(storeId);
    }

    public static Long get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
