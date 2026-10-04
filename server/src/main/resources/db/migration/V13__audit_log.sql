-- 操作审计日志：员工 / 顾客 / 系统的一切写操作、登录、敏感数据查看。只追加，不可修改、不可删除
CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    store_id      BIGINT,                       -- 所属门店（登录失败且账号不存在时为空）
    actor_type    VARCHAR(16)  NOT NULL,        -- STAFF 员工 / CUSTOMER 顾客 / SYSTEM 系统任务 / ANONYMOUS 未登录
    actor_id      BIGINT,
    actor_name    VARCHAR(64),                  -- 员工姓名 / 顾客昵称 / 登录时填写的账号（手机号已脱敏）
    actor_role    VARCHAR(16),                  -- OWNER / STAFF / KITCHEN
    category      VARCHAR(32)  NOT NULL,        -- 模块：订单、退款、会员……
    op_type       VARCHAR(16)  NOT NULL,        -- 操作类别：LOGIN 登录认证 / VIEW 敏感查看 / EXPORT 导出 / FUND 资金 / SECURITY 账号权限
                                                --          CREATE 新增 / UPDATE 修改 / DELETE 删除 / STATUS 状态流转 / SYSTEM 系统自动
    action        VARCHAR(128) NOT NULL,        -- 操作名称
    target        VARCHAR(255),                 -- 操作对象，如 orderNo=2026…、id=12
    http_method   VARCHAR(8),
    path          VARCHAR(255),
    detail        TEXT,                         -- 请求参数（密码类字段已打码，超长截断）
    success       BOOLEAN      NOT NULL,
    error_code    INT,
    error_message VARCHAR(255),
    ip            VARCHAR(64),
    user_agent    VARCHAR(255),
    duration_ms   INT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_store_time ON audit_log (store_id, created_at DESC);
CREATE INDEX idx_audit_store_actor ON audit_log (store_id, actor_type, actor_id, created_at DESC);
-- 按类别检索（如只看资金操作、账号权限变更）
CREATE INDEX idx_audit_store_type ON audit_log (store_id, op_type, created_at DESC);

-- 防篡改：审计日志只能追加。任何 UPDATE / DELETE / TRUNCATE 都直接报错（应用代码也不提供修改接口）
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER trg_audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
