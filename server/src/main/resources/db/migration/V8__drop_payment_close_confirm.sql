-- 微信 / 支付宝渠道已停用：只剩余额支付（发起即同步扣费入账），不存在「本地已关单、渠道未确认」的支付单，
-- V6 为渠道对账加的标记与索引不再使用。历史订单、支付单与 customer_auth（小程序 openid）保留，供查询历史数据。
DROP INDEX IF EXISTS idx_payment_close_unconfirmed;
ALTER TABLE payment DROP COLUMN IF EXISTS close_confirmed;
