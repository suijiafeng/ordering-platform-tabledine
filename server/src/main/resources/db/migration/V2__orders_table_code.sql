-- 订单记录桌号快照：桌台被改名或删除后，历史订单仍能显示下单时的桌号
ALTER TABLE orders ADD COLUMN table_code VARCHAR(16);
