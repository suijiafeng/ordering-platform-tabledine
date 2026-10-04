-- 顾客在商家接单后申请取消：需前厅 / 店主确认。只允许在后厨开始制作前申请，每单只能申请一次
ALTER TABLE orders ADD COLUMN cancel_request_status VARCHAR(16);      -- APPLYING 待处理 / APPROVED 已同意 / REJECTED 已拒绝
ALTER TABLE orders ADD COLUMN cancel_request_reason VARCHAR(255);     -- 顾客填写的取消原因
ALTER TABLE orders ADD COLUMN cancel_requested_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN cancel_reject_reason VARCHAR(255);      -- 商家拒绝理由（顾客可见）
ALTER TABLE orders ADD COLUMN cancel_handled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN cancel_handled_by BIGINT;               -- 处理的员工 ID
-- 商家端轮询统计待处理的取消申请
CREATE INDEX idx_orders_cancel_applying ON orders (store_id) WHERE cancel_request_status = 'APPLYING';
