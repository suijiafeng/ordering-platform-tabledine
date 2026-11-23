-- =====================================================================
-- 开发环境种子数据（仅 dev profile 加载：spring.flyway.locations 包含 classpath:db/seed）
-- 可重复执行：固定 ID + ON CONFLICT DO NOTHING
-- 账号：店主 admin / admin123；店员 staff / staff123
-- 桌码：dev-table-a1 / dev-table-a2 / dev-table-a3，另有 B1~B4、包间1
-- 菜品图：/uploads/demo/*.jpg（src/main/resources/dev-uploads/demo，dev 下由后端直接提供）
-- =====================================================================

INSERT INTO store (id, name, phone, address, business_status, business_hours)
VALUES (1, '湘味小馆（开发环境）', '0731-8888 6666', '长沙市天心区坡子街 88 号', 1, '10:00-22:00')
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
    (3, 1, 'A3', 'dev-table-a3'),
    (4, 1, 'B1', 'dev-table-b1'),
    (5, 1, 'B2', 'dev-table-b2'),
    (6, 1, 'B3', 'dev-table-b3'),
    (7, 1, 'B4', 'dev-table-b4'),
    (8, 1, '包间1', 'dev-table-vip1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO category (id, store_id, name, sort)
VALUES
    (1, 1, '招牌热菜', 1),
    (2, 1, '饮品', 5),
    (3, 1, '家常小炒', 2),
    (4, 1, '凉菜', 3),
    (5, 1, '汤羹主食', 4)
ON CONFLICT (id) DO NOTHING;

-- 菜品 1~3 的名称、价格被集成测试引用，保持不变；已有开发库只补上图片
INSERT INTO dish (id, store_id, category_id, name, description, price, image, sort)
VALUES
    (1, 1, 1, '红烧肉', '肥而不腻，入口即化', 3800, '/uploads/demo/hongshaorou.jpg', 1),
    (2, 1, 1, '番茄炒蛋', '家常味道', 1800, '/uploads/demo/fanqie-chaodan.jpg', 2),
    (3, 1, 2, '珍珠奶茶', '可选杯型与小料', 1200, '/uploads/demo/zhenzhu-naicha.jpg', 1),
    (4, 1, 1, '剁椒鱼头', '鲜鳙鱼头配自制剁椒，蒸足 12 分钟', 8800, '/uploads/demo/duojiao-yutou.jpg', 3),
    (5, 1, 1, '小炒黄牛肉', '黄牛肉现切现炒，香辣嫩滑', 4800, '/uploads/demo/xiaochao-huangniurou.jpg', 4),
    (6, 1, 1, '口味虾', '小龙虾配紫苏，麻辣鲜香', 9800, '/uploads/demo/kouwei-xia.jpg', 5),
    (7, 1, 1, '啤酒鸭', '整瓶啤酒焖制，砂锅上桌', 5800, '/uploads/demo/pijiu-ya.jpg', 6),
    (8, 1, 3, '辣椒炒肉', '螺丝椒配五花肉，下饭神器', 3800, '/uploads/demo/lajiao-chaorou.jpg', 1),
    (9, 1, 3, '外婆菜炒蛋', '湘西外婆菜，咸香下饭', 2200, '/uploads/demo/waipocai-chaodan.jpg', 2),
    (10, 1, 3, '酸辣土豆丝', '脆爽酸辣', 1600, '/uploads/demo/suanla-tudousi.jpg', 3),
    (11, 1, 3, '手撕包菜', '干锅爆炒，锅气足', 1800, '/uploads/demo/shousi-baocai.jpg', 4),
    (12, 1, 4, '凉拌黄瓜', '蒜香拍黄瓜', 1200, '/uploads/demo/liangban-huanggua.jpg', 1),
    (13, 1, 4, '皮蛋豆腐', '内酯豆腐配松花蛋', 1500, '/uploads/demo/pidan-doufu.jpg', 2),
    (14, 1, 5, '紫菜蛋花汤', '一份两到三人', 1200, '/uploads/demo/zicai-danhuatang.jpg', 1),
    (15, 1, 5, '米饭', '东北长粒香，一碗', 200, '/uploads/demo/mifan.jpg', 2),
    (16, 1, 2, '酸梅汤', '自熬乌梅山楂，冰镇', 800, '/uploads/demo/suanmei-tang.jpg', 2),
    (17, 1, 2, '啤酒', '500ml 冰镇', 1000, '/uploads/demo/pijiu.jpg', 3)
ON CONFLICT (id) DO UPDATE SET image = COALESCE(dish.image, EXCLUDED.image);

-- 奶茶：规格组「杯型」（必选，单选）
INSERT INTO dish_spec_group (id, dish_id, name, required, sort)
VALUES (1, 3, '杯型', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish_spec_item (id, group_id, name, price_delta, is_default, sort)
VALUES
    (1, 1, '中杯', 0, TRUE, 1),
    (2, 1, '大杯', 300, FALSE, 2)
ON CONFLICT (id) DO NOTHING;

-- 剁椒鱼头：规格组「辣度」（必选，单选，不加价）
INSERT INTO dish_spec_group (id, dish_id, name, required, sort)
VALUES (2, 4, '辣度', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish_spec_item (id, group_id, name, price_delta, is_default, sort)
VALUES
    (3, 2, '微辣', 0, TRUE, 1),
    (4, 2, '中辣', 0, FALSE, 2),
    (5, 2, '特辣', 0, FALSE, 3)
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

-- H5 会员账号（手机号登录，密码 staff123），余额 100 元；流水与 customer.balance 保持一致
INSERT INTO customer (id, nickname, phone, status, store_id, password_hash, balance)
VALUES (1001, '测试会员', '13800000001', 1, 1, '$2a$10$gine/4MjPyHz3TSIvSYF9Objbi16p6mN8zvaHymzW.2zvfE74POs.', 10000)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wallet_transaction (id, store_id, customer_id, type, amount, balance_after, operator_id, remark)
VALUES (1001, 1, 1001, 'RECHARGE', 10000, 10000, 1, '开发环境种子充值')
ON CONFLICT (id) DO NOTHING;

-- 固定 ID 插入后，把序列推到当前最大值之后，避免后续新增主键冲突
SELECT setval(pg_get_serial_sequence('customer', 'id'),        GREATEST((SELECT MAX(id) FROM customer), 1));
SELECT setval(pg_get_serial_sequence('wallet_transaction', 'id'), GREATEST((SELECT MAX(id) FROM wallet_transaction), 1));
SELECT setval(pg_get_serial_sequence('store', 'id'),           GREATEST((SELECT MAX(id) FROM store), 1));
SELECT setval(pg_get_serial_sequence('staff', 'id'),           GREATEST((SELECT MAX(id) FROM staff), 1));
SELECT setval(pg_get_serial_sequence('dining_table', 'id'),    GREATEST((SELECT MAX(id) FROM dining_table), 1));
SELECT setval(pg_get_serial_sequence('category', 'id'),        GREATEST((SELECT MAX(id) FROM category), 1));
SELECT setval(pg_get_serial_sequence('dish', 'id'),            GREATEST((SELECT MAX(id) FROM dish), 1));
SELECT setval(pg_get_serial_sequence('dish_spec_group', 'id'), GREATEST((SELECT MAX(id) FROM dish_spec_group), 1));
SELECT setval(pg_get_serial_sequence('dish_spec_item', 'id'),  GREATEST((SELECT MAX(id) FROM dish_spec_item), 1));
SELECT setval(pg_get_serial_sequence('addon_group', 'id'),     GREATEST((SELECT MAX(id) FROM addon_group), 1));
SELECT setval(pg_get_serial_sequence('addon_item', 'id'),      GREATEST((SELECT MAX(id) FROM addon_item), 1));
