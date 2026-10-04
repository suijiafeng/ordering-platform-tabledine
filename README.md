# 点餐平台（ordering-platform）

个人店面堂食扫码点餐：微信 / 支付宝小程序点餐支付，商家后台接单出餐。

| 目录 | 说明 |
|---|---|
| `server/` | 后端：Spring Boot 3.3 + MyBatis-Plus + PostgreSQL 16 + Flyway |
| `miniapp/` | 顾客端：Taro 4 + React 18 + TS，构建为微信、支付宝小程序 |
| `merchant-web/` | 商家端：Vite 6 + React 18 + Ant Design 5 |
| `deploy/` | docker-compose、Nginx、桌码落地页 |
| `docs/` | 需求分析 v1.2、工程化设计文档 |

## 当前进度：MVP 功能完成，进入联调 / 上线准备

- [x] 17 张表建表（Flyway `V1__init_schema.sql`）+ 开发环境种子数据
- [x] 统一响应 / 错误码 / 全局异常
- [x] 双 JWT 体系：顾客（audience=customer）与员工（audience=merchant）互不通用
- [x] 员工登录、refresh 续期、连续失败锁定、停用后 token 立即失效
- [x] 顾客小程序静默登录（微信 code2Session / 支付宝 oauth.token / 开发环境 Mock）
- [x] 多租户插件（商家端按 store_id 自动过滤）、接口限流
- [x] 扫码解析 `GET /api/v1/c/qr/{qrToken}`、店铺信息
- [x] 小程序：双端登录 / 扫码参数解析 / 请求封装（401 自动重登重放），两端构建通过
- [x] 商家端：登录、路由守卫、token 自动续期、菜单骨架
- [x] 第 2 周后端：分类 / 菜品（规格组、加料组整体保存）、上下架、沽清、每日限量；桌台增删改、批量新建、重置桌码；店铺设置与营业状态；图片上传（压缩 + 缩略图）；顾客端完整菜单接口
- [x] 第 2 周商家端：菜品管理、桌台管理（桌码预览 / 下载 / A4 批量打印）、店铺设置
- [x] 第 2 周小程序：分类 + 菜品列表、规格加料弹层、购物车（本地保存，菜单刷新后自动对账）、确认订单页
- [x] 第 3~4 周后端 + 商家端：下单（服务端重算价格 + 幂等）、微信 / 支付宝 / Mock 支付、订单履约、退款全流程、定时任务、看板与报表、订单页与后厨队列
- [x] 小程序下单闭环：提交订单 → 调起支付 → 订单详情（自动轮询）、我的订单、取消 / 申请退款 / 撤回
- [x] 定时任务集成测试（关单 / 迟到支付找回 / 超时未接单自动退款 / 退款补偿）
- [x] 后端严格审查 5 批修复：部署安全基线、退款资金安全、支付渠道对接、下单计价与库存、上传防护；全量 74 个测试通过
- [x] 小程序按菜品部分退款（选份数、实时金额、全选即整单）
- [x] 员工管理：店主新建店员 / 改名 / 重置密码 / 启用停用（停用与改密后旧会话立即失效）；所有员工可修改自己密码
- [x] 顾客端体验补齐：菜品搜索、规格弹层显示菜品描述、待支付实时倒计时（详情与列表）、订单进度时间线、退款记录显示菜品明细与申请时间、列表显示实付与已退金额、待支付订单「去支付」入口
- [x] 商家端：新订单弹窗通知（点击直达该订单详情）、菜品排序字段、上下架 / 沽清 / 分类排序失败时的提示与回滚
- [ ] 下一步：双端真机联调（真实商户号 0.01 元）、提审上线清单

## 本地开发

### 环境要求

- JDK 17 或 21、Maven 3.9+
- Node.js 20+
- Docker（运行 PostgreSQL 和集成测试）
- 微信开发者工具、支付宝小程序开发者工具

### 1. 启动数据库

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

### 2. 启动后端

```bash
cd server
mvn spring-boot:run          # 默认 dev profile：自动建表 + 种子数据 + 模拟小程序登录
```

- 接口文档：http://localhost:8080/swagger-ui.html
- 种子账号：店主 `admin / admin123`，店员 `staff / staff123`
- 测试桌码：`dev-table-a1`、`dev-table-a2`、`dev-table-a3`

运行测试（集成测试需要 Docker，没有 Docker 时自动跳过）：

```bash
mvn verify
# Docker 29+ 拒绝旧版 Testcontainers 的 API 版本，此时测试会被静默跳过，需加：
mvn verify -DargLine="-Dapi.version=1.44"
```

### 3. 启动商家端

```bash
cd merchant-web
npm install
npm run dev                  # http://localhost:5173，/api 代理到 8080
PORT=5174 npm run dev        # 端口被占用时换端口；代理会去掉 Origin 头，不受后端 CORS 白名单限制
```

### 4. 启动小程序

```bash
cd miniapp
npm install
npm run dev:weapp            # 微信开发者工具导入 miniapp/dist/weapp
npm run dev:alipay           # 支付宝开发者工具导入 miniapp/dist/alipay
```

- 开发者工具中勾选「不校验合法域名」
- 模拟扫码：在编译模式里给首页加启动参数 `token=dev-table-a1`，或 `q=https%3A%2F%2Fexample.com%2Fq%2Fdev-table-a1`（微信）/ `qrCode=https://example.com/q/dev-table-a1`（支付宝）
- 开发环境登录走 Mock：开发者工具里拿到的任何 code 都映射为同一个开发顾客
- 真机预览：把 `miniapp/.env.development` 中的地址改成电脑的局域网 IP

## 关键约定

编码规范见 [docs/编码规范.md](docs/编码规范.md)；提交前运行 `mvn verify`（含 Checkstyle）与两端 `npm run lint`。


- **金额**：全部以「分」为单位的整数（`BIGINT`）
- **错误码**：见 `server/.../common/ErrorCode.java`（与需求文档 §11.1 一致）
- **数据库变更**：只通过 Flyway 新增 `V{n}__xxx.sql`，不改已执行的脚本，不手改生产库
- **门店隔离**：商家端请求由 JWT 注入门店上下文，多租户插件自动对 `staff / category / dish / dining_table / orders / refund` 追加 `store_id` 条件；顾客端、定时任务、支付回调没有门店上下文，需要在代码中显式按 `store_id` 过滤
- **分支**：`main`（可发布）← `develop` ← `feature/*`；提交信息 `feat|fix|refactor|docs|test|chore: 描述`

## 生产部署（概要）

1. 服务器安装 Docker，域名解析到服务器，完成 ICP 备案
2. `cp deploy/.env.example deploy/.env` 并填写（`JWT_SECRET` 用 `openssl rand -base64 48` 生成；支付参数见 [docs/上线清单.md](docs/上线清单.md)）
3. 替换 `deploy/nginx/conf.d/ordering.conf` 中的域名
4. 首次签发证书（nginx 启动前）：
   ```bash
   docker run --rm -p 80:80 -v ordering_certbot-conf:/etc/letsencrypt certbot/certbot \
     certonly --standalone -d <你的域名> --agree-tos -m <邮箱> --non-interactive
   ```
   卷名前缀取决于 compose 项目名（默认是 deploy 目录名，可用 `docker volume ls` 确认）
5. 构建商家端：`cd merchant-web && npm ci && npm run build`
6. `cd deploy && docker compose up -d --build`
7. 首次启动会按 `BOOTSTRAP_*` 创建门店和店主账号，确认后把 `BOOTSTRAP_ENABLED` 改为 `false`
8. 把微信、支付宝的普通二维码校验文件放到 `deploy/nginx/html/` 根目录

## 与工程化设计文档的差异

开工时对设计文档做了几处修正：

| 设计文档 | 实际实现 | 原因 |
|---|---|---|
| postgres 挂载 `init.sql` 同时使用 Flyway | 只用 Flyway | 两者同时建表会导致 Flyway 首次迁移失败 |
| `refund` 表没有 `store_id` | 增加 `store_id` 及 `(store_id, status)` 索引 | 商家端按门店查退款单，多租户插件也需要该字段 |
| 退款「同一订单只能有一笔进行中」只在应用层控制 | 增加部分唯一索引 `uk_refund_order_active` 兜底 | 防止并发下超退 |
| Nginx `location = /q/` | `location /q/` + `try_files` | 精确匹配无法匹配 `/q/{token}` |
| 只有 443 server | 增加 80 端口（证书校验 + 跳转 HTTPS）和 certbot 续期容器 | 证书自动续期需要 |
| 种子数据写在 `init.sql` | 放在 `db/seed/R__dev_seed.sql`，只在 dev / test 加载 | 生产库不能带默认账号；生产用 `BOOTSTRAP_*` 初始化 |
| 后端打包桌码 ZIP（每桌 PNG） | 后端只返回桌码链接，商家端生成二维码、下载 PNG、A4 批量打印 | 服务端绘制中文需要字体，Alpine 镜像没有；浏览器绘制更简单 |
| 订单只存 `table_id` | V2 迁移增加 `orders.table_code` 桌号快照 | 桌台改名或删除后历史订单仍能显示桌号 |
| 规格 / 加料接口单独 CRUD | 随菜品整体保存（`PUT /dishes/{id}` 整体替换） | 前端一个表单编辑完成，避免部分保存造成数据不一致 |
