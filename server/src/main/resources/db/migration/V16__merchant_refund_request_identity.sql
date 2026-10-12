-- 商家退款创建请求的永久身份：SUCCESS / OFFLINE 后依然防重，历史数据保留为空。
-- 新版接口拒绝没有 clientRequestId 的创建请求，旧客户端须刷新后再退款。
ALTER TABLE refund ADD COLUMN client_request_id VARCHAR(64);
ALTER TABLE refund ADD COLUMN request_fingerprint VARCHAR(64);
ALTER TABLE refund ADD CONSTRAINT ck_refund_request_identity
    CHECK ((client_request_id IS NULL AND request_fingerprint IS NULL)
        OR (client_request_id IS NOT NULL AND request_fingerprint IS NOT NULL));
CREATE UNIQUE INDEX uk_refund_merchant_request ON refund (store_id, client_request_id)
    WHERE client_request_id IS NOT NULL;
