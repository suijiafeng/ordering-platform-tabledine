-- 员工 refresh token 轮换：每个有效的 refresh token 在这里有一行（id = token 的 jti）。
-- 刷新时删掉旧行、插入新行，旧 refresh token 立即失效；登录多台设备各有一条，互不影响。
-- 停用 / 改密靠 staff.token_version 让所有 token 失效，这里只负责「一个 refresh token 只能用一次」。
CREATE TABLE staff_refresh_token (
    id         VARCHAR(64) PRIMARY KEY,                -- JWT jti
    staff_id   BIGINT      NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_refresh_token_staff ON staff_refresh_token (staff_id);
CREATE INDEX idx_staff_refresh_token_expires ON staff_refresh_token (expires_at);
