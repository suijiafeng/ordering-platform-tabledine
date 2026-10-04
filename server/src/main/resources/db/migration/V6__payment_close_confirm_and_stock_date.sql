-- 1) 支付单本地关闭后，渠道关单是否已确认。
--    本地已关、渠道关单失败、成功回调又没送达 → 这笔付款会脱离「待支付订单」的查单范围；
--    记录下来持续查单，确认已付则走已有的迟到支付自动退款。历史数据视为已确认。
ALTER TABLE payment ADD COLUMN close_confirmed BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_payment_close_unconfirmed ON payment (updated_at) WHERE status = 'CLOSED' AND NOT close_confirmed;

-- 2) 每日限量的业务日期：今日剩余归属于哪一天。
--    取消昨天的订单不能把今天的剩余加回去；停机错过 0 点后，按日期判断补做重置（幂等）。
ALTER TABLE dish ADD COLUMN stock_date DATE;
UPDATE dish SET stock_date = (now() AT TIME ZONE 'Asia/Shanghai')::date WHERE daily_stock IS NOT NULL;
