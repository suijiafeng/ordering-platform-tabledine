-- 充值幂等：商家端每次打开充值窗口生成一个 request_id，超时重试 / 双击提交不会重复入账
ALTER TABLE wallet_transaction ADD COLUMN request_id VARCHAR(64);
CREATE UNIQUE INDEX uk_wallet_txn_recharge_request ON wallet_transaction (customer_id, request_id)
    WHERE type = 'RECHARGE' AND request_id IS NOT NULL;
