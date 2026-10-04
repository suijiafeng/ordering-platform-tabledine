-- 退款作用域：order_scoped = 计入订单已退金额的退款（顾客 / 商家 / 超时未接单等）；
-- false = 重复支付、关单后迟到支付的自动退款，只退那笔多余的支付单，不占用订单可退余额。
ALTER TABLE refund ADD COLUMN order_scoped BOOLEAN NOT NULL DEFAULT TRUE;

-- 历史数据：关联到「非订单首笔成功支付」或已关闭订单的退款，归为支付单级
UPDATE refund r SET order_scoped = FALSE
WHERE r.payment_id IS NOT NULL
  AND (EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.status = 'CLOSED')
       OR r.payment_id <> (SELECT MIN(p.id) FROM payment p WHERE p.order_id = r.order_id AND p.status = 'SUCCESS'));

-- 「同一订单同一时刻只允许一笔进行中退款」：
-- 1) 补上 FAILED（代码里 FAILED 同样占用名额，但原索引未覆盖，并发下可出现 FAILED + PROCESSING 并存）
-- 2) 只约束订单级退款，支付单级的自动退款不再被订单上进行中的退款卡住
DROP INDEX IF EXISTS uk_refund_order_active;
CREATE UNIQUE INDEX uk_refund_order_active ON refund (order_id)
    WHERE order_scoped AND status IN ('APPLYING', 'PROCESSING', 'FAILED');
-- 支付单级：同一笔支付同一时刻只允许一笔进行中退款
CREATE UNIQUE INDEX uk_refund_payment_active ON refund (payment_id)
    WHERE NOT order_scoped AND status IN ('APPLYING', 'PROCESSING', 'FAILED');

-- 补偿任务按 updated_at 轮转扫描处理中的退款
CREATE INDEX idx_refund_processing ON refund (updated_at) WHERE status = 'PROCESSING';
