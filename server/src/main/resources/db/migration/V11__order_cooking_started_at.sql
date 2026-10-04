-- 后厨开始制作时间：制作中（MAKING）细分为「待制作」（前厅已确认、后厨未开始）与「制作中」（后厨已开始）
-- 只用于商家端后厨看板，不改变订单状态机，顾客端仍显示「制作中」
ALTER TABLE orders ADD COLUMN cooking_started_at TIMESTAMPTZ;
