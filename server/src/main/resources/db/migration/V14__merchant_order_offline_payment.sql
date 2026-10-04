-- 前厅代客下单 + 线下收款登记（记账）
-- 1. 代客下单没有顾客账号：customer_id 允许为空，记录下单来源与下单员工
ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER';   -- CUSTOMER 顾客扫码 / MERCHANT 前厅代客下单
ALTER TABLE orders ADD COLUMN created_by_staff_id BIGINT;                         -- 代客下单的员工
-- 原唯一键 (customer_id, client_request_id) 在 customer_id 为空时不生效：代客下单按门店单独防重复提交
CREATE UNIQUE INDEX uk_orders_merchant_req ON orders (store_id, client_request_id) WHERE customer_id IS NULL;

-- 2. 线下收款：记录收款方式与登记员工，便于按收款方式对账
ALTER TABLE payment ADD COLUMN pay_method VARCHAR(16);    -- 线下收款方式 CASH 现金 / WECHAT 微信 / ALIPAY 支付宝 / CARD 银行卡 / OTHER 其他；余额支付为空
ALTER TABLE payment ADD COLUMN operator_id BIGINT;        -- 登记收款的员工
ALTER TABLE payment ADD COLUMN remark VARCHAR(255);
