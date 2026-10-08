package com.example.ordering.tenant;

import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;

import java.util.Locale;
import java.util.Set;

/**
 * 多租户插件：对带 store_id 的业务表自动追加 store_id = 当前门店。
 * <p>
 * 只对白名单中的表生效。规格 / 加料 / 订单明细等子表没有 store_id，
 * 通过父表（dish / orders）的归属校验间接隔离。
 */
public class StoreTenantLineHandler implements TenantLineHandler {

    /** 含 store_id 字段、需要自动隔离的表 */
    static final Set<String> TENANT_TABLES = Set.of(
            "staff", "category", "dish", "dining_table", "orders", "refund"
    );

    @Override
    public Expression getTenantId() {
        return new LongValue(StoreContext.get());
    }

    @Override
    public String getTenantIdColumn() {
        return "store_id";
    }

    @Override
    public boolean ignoreTable(String tableName) {
        if (StoreContext.get() == null) {
            return true;
        }
        String name = tableName.replace("\"", "").toLowerCase(Locale.ROOT);
        return !TENANT_TABLES.contains(name);
    }
}
