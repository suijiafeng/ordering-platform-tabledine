-- =====================================================================
-- 开发环境种子数据（仅 dev profile 加载：spring.flyway.locations 包含 classpath:db/seed）
-- 可重复执行：固定 ID + ON CONFLICT DO NOTHING
-- 账号：店主 admin / admin123；店员 staff / staff123
-- 桌码：dev-table-a1 / dev-table-a2 / dev-table-a3
-- =====================================================================

INSERT INTO store (id, name, phone, address, business_status, business_hours)
VALUES (1, '小馆子（开发环境）', '13800000000', '示例路 1 号', 1, '10:00-22:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff (id, store_id, username, password_hash, name, role, status)
VALUES
    (1, 1, 'admin', '$2a$10$ZLm.tf8.F/093j7wkqmPLOg11Hu6RC8zrzZHgfDe4VkoPlc2Z.i8y', '店主', 'OWNER', 1),
    (2, 1, 'staff', '$2a$10$gine/4MjPyHz3TSIvSYF9Objbi16p6mN8zvaHymzW.2zvfE74POs.', '店员小王', 'STAFF', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dining_table (id, store_id, code, qr_token)
VALUES
    (1, 1, 'A1', 'dev-table-a1'),
    (2, 1, 'A2', 'dev-table-a2'),
    (3, 1, 'A3', 'dev-table-a3')
ON CONFLICT (id) DO NOTHING;

INSERT INTO category (id, store_id, name, sort)
VALUES
    (1, 1, '招牌热菜', 1),
    (2, 1, '饮品', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish (id, store_id, category_id, name, description, price, sort)
VALUES
    (1, 1, 1, '红烧肉', '肥而不腻，入口即化', 3800, 1),
    (2, 1, 1, '番茄炒蛋', '家常味道', 1800, 2),
    (3, 1, 2, '珍珠奶茶', '可选杯型与小料', 1200, 1)
ON CONFLICT (id) DO NOTHING;

-- 奶茶：规格组「杯型」（必选，单选）
INSERT INTO dish_spec_group (id, dish_id, name, required, sort)
VALUES (1, 3, '杯型', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish_spec_item (id, group_id, name, price_delta, is_default, sort)
VALUES
    (1, 1, '中杯', 0, TRUE, 1),
    (2, 1, '大杯', 300, FALSE, 2)
ON CONFLICT (id) DO NOTHING;

-- 奶茶：加料组「小料」（最多选 2 个）
INSERT INTO addon_group (id, dish_id, name, max_count, sort)
VALUES (1, 3, '小料', 2, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO addon_item (id, group_id, name, price_delta, sort)
VALUES
    (1, 1, '珍珠', 200, 1),
    (2, 1, '椰果', 200, 2),
    (3, 1, '布丁', 300, 3)
ON CONFLICT (id) DO NOTHING;

-- 固定 ID 插入后，把序列推到当前最大值之后，避免后续新增主键冲突
SELECT setval(pg_get_serial_sequence('store', 'id'),           GREATEST((SELECT MAX(id) FROM store), 1));
SELECT setval(pg_get_serial_sequence('staff', 'id'),           GREATEST((SELECT MAX(id) FROM staff), 1));
SELECT setval(pg_get_serial_sequence('dining_table', 'id'),    GREATEST((SELECT MAX(id) FROM dining_table), 1));
SELECT setval(pg_get_serial_sequence('category', 'id'),        GREATEST((SELECT MAX(id) FROM category), 1));
SELECT setval(pg_get_serial_sequence('dish', 'id'),            GREATEST((SELECT MAX(id) FROM dish), 1));
SELECT setval(pg_get_serial_sequence('dish_spec_group', 'id'), GREATEST((SELECT MAX(id) FROM dish_spec_group), 1));
SELECT setval(pg_get_serial_sequence('dish_spec_item', 'id'),  GREATEST((SELECT MAX(id) FROM dish_spec_item), 1));
SELECT setval(pg_get_serial_sequence('addon_group', 'id'),     GREATEST((SELECT MAX(id) FROM addon_group), 1));
SELECT setval(pg_get_serial_sequence('addon_item', 'id'),      GREATEST((SELECT MAX(id) FROM addon_item), 1));
