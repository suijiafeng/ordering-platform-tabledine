-- 会员账号与余额钱包（H5 点餐：商家为会员充值，下单从余额扣费，不再经过微信 / 支付宝支付）
--
-- customer 扩展：
--   store_id       会员归属门店（商家后台创建的会员；小程序顾客为空）
--   phone          登录账号（手机号），非空时唯一
--   password_hash  登录密码（BCrypt）；为空表示不能用密码登录
--   balance        账户余额（分），不允许为负：扣费用条件更新 balance >= 金额
--   token_version  重置密码 / 停用后让旧 token 失效（与员工表同一机制）
ALTER TABLE customer ADD COLUMN store_id      BIGINT;
ALTER TABLE customer ADD COLUMN password_hash VARCHAR(100);
ALTER TABLE customer ADD COLUMN balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0);
ALTER TABLE customer ADD COLUMN token_version INT    NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX uk_customer_phone ON customer (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customer_store ON customer (store_id) WHERE store_id IS NOT NULL;

-- 钱包流水：每一次余额变动一条，balance_after 为变动后的余额，便于对账
--   type        RECHARGE 充值 / PAY 下单扣费 / REFUND 退款返还
--   out_trade_no  PAY 对应的商户订单号（唯一：同一笔支付只能扣一次）
--   refund_no     REFUND 对应的退款单号（唯一：同一笔退款只能返还一次，渠道重试幂等）
CREATE TABLE wallet_transaction (
    id            BIGSERIAL   PRIMARY KEY,
    store_id      BIGINT      NOT NULL,
    customer_id   BIGINT      NOT NULL,
    type          VARCHAR(16) NOT NULL,
    amount        BIGINT      NOT NULL CHECK (amount > 0),
    balance_after BIGINT      NOT NULL CHECK (balance_after >= 0),
    order_id      BIGINT,
    out_trade_no  VARCHAR(64),
    refund_no     VARCHAR(64),
    operator_id   BIGINT,                                 -- 充值操作员工
    remark        VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_txn_customer ON wallet_transaction (customer_id, id DESC);
CREATE INDEX idx_wallet_txn_store_time ON wallet_transaction (store_id, type, created_at);
CREATE UNIQUE INDEX uk_wallet_txn_pay ON wallet_transaction (out_trade_no) WHERE type = 'PAY';
CREATE UNIQUE INDEX uk_wallet_txn_refund ON wallet_transaction (refund_no) WHERE type = 'REFUND';
