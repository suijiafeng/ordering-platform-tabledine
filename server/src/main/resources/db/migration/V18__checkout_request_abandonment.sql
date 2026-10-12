-- 请求身份独立于订单保存，放弃后即使迟到的原请求才到达，也不得再占库存或生成订单。
-- 创建和放弃都先 INSERT ON CONFLICT，再 SELECT FOR UPDATE；两步与业务共用一个事务。
CREATE TABLE checkout_request (
    customer_id       BIGINT      NOT NULL,
    client_request_id VARCHAR(64) NOT NULL,
    abandoned         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, client_request_id)
);

-- 升级前已存在的订单保留原身份；运行时仍查询 orders，兼容没有账本行的历史订单。
INSERT INTO checkout_request (customer_id, client_request_id)
SELECT customer_id, client_request_id FROM orders
WHERE customer_id IS NOT NULL AND client_request_id IS NOT NULL
ON CONFLICT (customer_id, client_request_id) DO NOTHING;
