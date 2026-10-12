-- 今日占用不能由「限量 - 剩余」反推：限量降到已售以下、或暂时取消限量后，该差值会丢失真实占用。
-- 不限量期间同样记录占用；每日重置时清零，取消订单只释放同一业务日期且尚未消耗的份数。
ALTER TABLE dish ADD COLUMN stock_occupied BIGINT NOT NULL DEFAULT 0 CHECK (stock_occupied >= 0);

-- 从今日订单回填：未取消订单均占用；开工 / 出餐后的取消已消耗食材，不回补。
-- 保留原计数能证明的占用下限，兼容历史数据缺少开工时间等情况；过期计数不带入今天。
WITH occupied AS (
    SELECT oi.dish_id, SUM(oi.quantity) AS quantity
    FROM order_item oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
      AND o.created_at < (date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 day') AT TIME ZONE 'Asia/Shanghai'
      AND (o.status NOT IN ('CLOSED', 'CANCELLED')
           OR (o.status = 'CANCELLED' AND (o.cooking_started_at IS NOT NULL OR o.ready_at IS NOT NULL)))
    GROUP BY oi.dish_id
)
UPDATE dish d
SET stock_occupied = GREATEST(
        CASE WHEN d.stock_date = (now() AT TIME ZONE 'Asia/Shanghai')::date
             THEN COALESCE(d.daily_stock - d.stock_quantity, 0) ELSE 0 END,
        COALESCE((SELECT quantity FROM occupied WHERE dish_id = d.id), 0)),
    stock_date = (now() AT TIME ZONE 'Asia/Shanghai')::date;

UPDATE dish
SET stock_quantity = CASE WHEN daily_stock IS NULL THEN NULL ELSE GREATEST(0, daily_stock - stock_occupied) END;
