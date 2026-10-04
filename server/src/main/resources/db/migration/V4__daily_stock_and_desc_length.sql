-- 每日限量：daily_stock = 店主设置的每日限量（null 不限量），stock_quantity = 今日剩余；每天 0 点重置为 daily_stock
ALTER TABLE dish ADD COLUMN daily_stock INT CHECK (daily_stock IS NULL OR daily_stock >= 0);
UPDATE dish SET daily_stock = stock_quantity WHERE stock_quantity IS NOT NULL;

-- 规格 / 加料描述快照：最多 10 个规格组、每组 30 个加料项可选，原长度不够会导致合法下单 500
ALTER TABLE order_item ALTER COLUMN spec_desc TYPE TEXT;
ALTER TABLE order_item ALTER COLUMN addon_desc TYPE TEXT;
