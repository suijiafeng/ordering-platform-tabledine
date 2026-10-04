-- V4 把「今日剩余」当成了「每日限量」回填：当天卖完的菜会变成每天 0 点重置为 0、永远售罄。
-- 修正：每日限量 = 今日剩余 + 今日已占用（今天创建且未关闭 / 未取消的订单扣减的数量）
UPDATE dish d SET daily_stock = d.stock_quantity + COALESCE((
    SELECT SUM(oi.quantity) FROM order_item oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.dish_id = d.id
      AND o.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
      AND o.status NOT IN ('CLOSED', 'CANCELLED')
), 0)
WHERE d.daily_stock IS NOT NULL AND d.stock_quantity IS NOT NULL;
