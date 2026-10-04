-- =====================================================================
-- 点餐平台 初始表结构（17 张表）
-- 约定：
--   * 金额统一 BIGINT，单位：分
--   * 不建物理外键，用索引 + 应用层校验
--   * created_at / updated_at 由应用层（MyBatis-Plus 自动填充）维护，库内给默认值兜底
--   * 软删除字段 deleted：0 正常 1 已删除
-- =====================================================================

-- 1. store 门店与业务参数
CREATE TABLE store (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(64)  NOT NULL,
    logo               VARCHAR(255),
    phone              VARCHAR(20),
    address            VARCHAR(255),
    business_status    SMALLINT     NOT NULL DEFAULT 1,   -- 1 营业 0 打烊
    business_hours     VARCHAR(64),
    auto_accept        BOOLEAN      NOT NULL DEFAULT FALSE,
    pay_timeout_min    INT          NOT NULL DEFAULT 15,
    accept_timeout_min INT          NOT NULL DEFAULT 10,
    after_sale_hours   INT          NOT NULL DEFAULT 24,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. customer 顾客
CREATE TABLE customer (
    id         BIGSERIAL PRIMARY KEY,
    nickname   VARCHAR(64),
    avatar     VARCHAR(255),
    phone      VARCHAR(20),                              -- 预留，MVP 不采集
    status     SMALLINT    NOT NULL DEFAULT 1,           -- 1 正常 0 禁用
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. customer_auth 顾客小程序身份
CREATE TABLE customer_auth (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT      NOT NULL,
    platform    VARCHAR(16) NOT NULL,                    -- WECHAT / ALIPAY
    open_id     VARCHAR(64) NOT NULL,
    union_id    VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_customer_auth UNIQUE (platform, open_id)
);
CREATE INDEX idx_customer_auth_cid ON customer_auth (customer_id);

-- 4. staff 员工
CREATE TABLE staff (
    id            BIGSERIAL PRIMARY KEY,
    store_id      BIGINT       NOT NULL,
    username      VARCHAR(32)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,                 -- BCrypt
    name          VARCHAR(32)  NOT NULL,
    role          VARCHAR(16)  NOT NULL DEFAULT 'STAFF', -- OWNER / STAFF
    status        SMALLINT     NOT NULL DEFAULT 1,       -- 1 启用 0 停用
    token_version INT          NOT NULL DEFAULT 0,       -- 停用 / 改密时 +1，旧 token 失效
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uk_staff_username UNIQUE (username)
);
CREATE INDEX idx_staff_store ON staff (store_id);

-- 5. category 菜品分类
CREATE TABLE category (
    id         BIGSERIAL PRIMARY KEY,
    store_id   BIGINT      NOT NULL,
    name       VARCHAR(32) NOT NULL,
    sort       INT         NOT NULL DEFAULT 0,
    status     SMALLINT    NOT NULL DEFAULT 1,
    deleted    SMALLINT    NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_category_store ON category (store_id);

-- 6. dish 菜品
CREATE TABLE dish (
    id             BIGSERIAL PRIMARY KEY,
    store_id       BIGINT      NOT NULL,
    category_id    BIGINT      NOT NULL,
    name           VARCHAR(64) NOT NULL,
    description    VARCHAR(255),
    price          BIGINT      NOT NULL CHECK (price >= 0),  -- 基础价（分）
    image          VARCHAR(255),
    sort           INT         NOT NULL DEFAULT 0,
    status         SMALLINT    NOT NULL DEFAULT 1,           -- 1 上架 0 下架
    is_sold_out    BOOLEAN     NOT NULL DEFAULT FALSE,
    stock_quantity INT CHECK (stock_quantity IS NULL OR stock_quantity >= 0),  -- 空 = 不限量
    deleted        SMALLINT    NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dish_store_cat ON dish (store_id, category_id);

-- 7. dish_spec_group 规格组（组内单选）
CREATE TABLE dish_spec_group (
    id         BIGSERIAL PRIMARY KEY,
    dish_id    BIGINT      NOT NULL,
    name       VARCHAR(32) NOT NULL,
    required   BOOLEAN     NOT NULL DEFAULT TRUE,
    sort       INT         NOT NULL DEFAULT 0,
    deleted    SMALLINT    NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spec_group_dish ON dish_spec_group (dish_id);

-- 8. dish_spec_item 规格项
CREATE TABLE dish_spec_item (
    id          BIGSERIAL PRIMARY KEY,
    group_id    BIGINT      NOT NULL,
    name        VARCHAR(32) NOT NULL,
    price_delta BIGINT      NOT NULL DEFAULT 0,             -- 加价（分），可为负
    is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
    sort        INT         NOT NULL DEFAULT 0,
    deleted     SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spec_item_group ON dish_spec_item (group_id);

-- 9. addon_group 加料组（可多选）
CREATE TABLE addon_group (
    id         BIGSERIAL PRIMARY KEY,
    dish_id    BIGINT      NOT NULL,
    name       VARCHAR(32) NOT NULL,
    max_count  INT         NOT NULL DEFAULT 1 CHECK (max_count >= 1),
    sort       INT         NOT NULL DEFAULT 0,
    deleted    SMALLINT    NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addon_group_dish ON addon_group (dish_id);

-- 10. addon_item 加料项
CREATE TABLE addon_item (
    id          BIGSERIAL PRIMARY KEY,
    group_id    BIGINT      NOT NULL,
    name        VARCHAR(32) NOT NULL,
    price_delta BIGINT      NOT NULL DEFAULT 0,
    sort        INT         NOT NULL DEFAULT 0,
    deleted     SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addon_item_group ON addon_item (group_id);

-- 11. dining_table 桌台
CREATE TABLE dining_table (
    id         BIGSERIAL PRIMARY KEY,
    store_id   BIGINT      NOT NULL,
    code       VARCHAR(16) NOT NULL,                    -- 桌号（展示用）
    qr_token   VARCHAR(64) NOT NULL,                    -- 随机不可猜，重置后旧码失效
    status     SMALLINT    NOT NULL DEFAULT 1,          -- 1 可用 0 停用
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_table_qr_token UNIQUE (qr_token),
    CONSTRAINT uk_table_store_code UNIQUE (store_id, code)
);

-- 12. orders 订单主表
CREATE TABLE orders (
    id                BIGSERIAL PRIMARY KEY,
    order_no          VARCHAR(32) NOT NULL,
    client_request_id VARCHAR(64) NOT NULL,              -- 客户端请求 ID，防重复下单
    store_id          BIGINT      NOT NULL,
    table_id          BIGINT,                            -- 外带 / 自提扩展时可空
    customer_id       BIGINT      NOT NULL,
    platform          VARCHAR(16) NOT NULL,              -- WECHAT / ALIPAY
    status            VARCHAR(16) NOT NULL,              -- PENDING_PAY/PAID/MAKING/READY/DONE/CLOSED/CANCELLED
    refund_status     VARCHAR(16) NOT NULL DEFAULT 'NONE',  -- NONE/PARTIAL/FULL
    total_amount      BIGINT      NOT NULL CHECK (total_amount >= 0),
    pay_amount        BIGINT      NOT NULL CHECK (pay_amount >= 0),
    refunded_amount   BIGINT      NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
    people_count      INT         NOT NULL DEFAULT 1,
    remark            VARCHAR(255),
    pay_expire_at     TIMESTAMPTZ NOT NULL,
    paid_at           TIMESTAMPTZ,
    accepted_at       TIMESTAMPTZ,
    ready_at          TIMESTAMPTZ,
    done_at           TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     VARCHAR(255),
    version           INT         NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_orders_order_no UNIQUE (order_no),
    CONSTRAINT uk_orders_client_req UNIQUE (customer_id, client_request_id),
    CONSTRAINT ck_orders_refunded CHECK (refunded_amount <= pay_amount)
);
CREATE INDEX idx_orders_store_status ON orders (store_id, status, created_at DESC);
CREATE INDEX idx_orders_customer ON orders (customer_id, created_at DESC);
-- 定时任务扫描用：待支付超时、待接单超时
CREATE INDEX idx_orders_pending_pay ON orders (pay_expire_at) WHERE status = 'PENDING_PAY';
CREATE INDEX idx_orders_paid ON orders (paid_at) WHERE status = 'PAID';

-- 13. order_item 订单明细（快照）
CREATE TABLE order_item (
    id             BIGSERIAL PRIMARY KEY,
    order_id       BIGINT      NOT NULL,
    dish_id        BIGINT      NOT NULL,
    dish_name      VARCHAR(64) NOT NULL,
    dish_image     VARCHAR(255),
    spec_item_ids  JSONB,                               -- 所选规格项 ID 数组
    addon_item_ids JSONB,                               -- 所选加料项 ID 数组
    spec_desc      VARCHAR(128),                        -- 如 "大杯"
    addon_desc     VARCHAR(255),                        -- 如 "珍珠, 椰果"
    unit_price     BIGINT      NOT NULL,                -- 单价（含规格 / 加料加价）
    quantity       INT         NOT NULL CHECK (quantity > 0),
    total_price    BIGINT      NOT NULL,
    refunded_qty   INT         NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_item_refunded CHECK (refunded_qty >= 0 AND refunded_qty <= quantity)
);
CREATE INDEX idx_order_item_order ON order_item (order_id);

-- 14. payment 支付记录（订单 1:N）
CREATE TABLE payment (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT      NOT NULL,
    out_trade_no    VARCHAR(32) NOT NULL,               -- 商户订单号 = 幂等键
    channel         VARCHAR(16) NOT NULL,               -- WECHAT / ALIPAY
    transaction_no  VARCHAR(64),                        -- 渠道交易号（回调后回填）
    amount          BIGINT      NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/SUCCESS/CLOSED
    paid_at         TIMESTAMPTZ,
    refunded_amount BIGINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_payment_out_trade_no UNIQUE (out_trade_no),
    CONSTRAINT uk_payment_channel_txn UNIQUE (channel, transaction_no),  -- PG 中多个 NULL 不冲突
    CONSTRAINT ck_payment_refunded CHECK (refunded_amount <= amount)
);
CREATE INDEX idx_payment_order ON payment (order_id);

-- 15. refund 退款单
CREATE TABLE refund (
    id                BIGSERIAL PRIMARY KEY,
    refund_no         VARCHAR(32) NOT NULL,             -- 商户退款单号 = 渠道幂等键
    store_id          BIGINT      NOT NULL,             -- 商家端按门店查询退款
    order_id          BIGINT      NOT NULL,
    payment_id        BIGINT,
    type              VARCHAR(16) NOT NULL,             -- FULL / ITEM / CUSTOM
    initiator         VARCHAR(16) NOT NULL,             -- CUSTOMER / MERCHANT / SYSTEM
    amount            BIGINT      NOT NULL CHECK (amount > 0),
    reason            VARCHAR(255),
    reject_reason     VARCHAR(255),
    status            VARCHAR(16) NOT NULL,             -- APPLYING/PROCESSING/SUCCESS/FAILED/REJECTED/WITHDRAWN/OFFLINE
    channel_refund_no VARCHAR(64),
    operator_id       BIGINT,                           -- 操作员工（系统发起为空）
    success_at        TIMESTAMPTZ,
    fail_reason       VARCHAR(255),
    version           INT         NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_refund_no UNIQUE (refund_no)
);
CREATE INDEX idx_refund_order ON refund (order_id);
CREATE INDEX idx_refund_store_status ON refund (store_id, status, created_at DESC);
-- 数据库层兜底：同一订单同一时刻只允许一笔退款处于 待审核 / 处理中
CREATE UNIQUE INDEX uk_refund_order_active ON refund (order_id)
    WHERE status IN ('APPLYING', 'PROCESSING');

-- 16. refund_item 退款明细（按菜品退）
CREATE TABLE refund_item (
    id            BIGSERIAL PRIMARY KEY,
    refund_id     BIGINT      NOT NULL,
    order_item_id BIGINT      NOT NULL,
    quantity      INT         NOT NULL CHECK (quantity > 0),
    amount        BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refund_item_refund ON refund_item (refund_id);

-- 17. order_status_log 订单状态流转日志
CREATE TABLE order_status_log (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT      NOT NULL,
    from_status   VARCHAR(16),
    to_status     VARCHAR(16) NOT NULL,
    operator_type VARCHAR(16),                          -- CUSTOMER / MERCHANT / SYSTEM / PAY_CHANNEL
    operator_id   BIGINT,
    remark        VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_log_order ON order_status_log (order_id);
