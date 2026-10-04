-- 代客下单的两种付款模式：PAY_FIRST 先付后吃（下单即登记收款）/ PAY_LATER 先吃后付（离店时结账登记收款）
-- 顾客扫码下单一律先付（余额支付）。先吃后付的订单在结账前 paid_at 为空，不计入实收，结账时才入账
ALTER TABLE orders ADD COLUMN pay_mode VARCHAR(16) NOT NULL DEFAULT 'PAY_FIRST';
-- 未结账清单：前厅代客、先吃后付、还没收款且未取消
CREATE INDEX idx_orders_unsettled ON orders (store_id, created_at)
    WHERE pay_mode = 'PAY_LATER' AND paid_at IS NULL AND status NOT IN ('CANCELLED', 'CLOSED');
