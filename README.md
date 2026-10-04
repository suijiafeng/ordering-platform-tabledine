# 点餐平台（ordering-platform）

个人店面堂食扫码点餐：顾客用手机浏览器（含微信 / 支付宝内置浏览器）扫桌码进入 H5 点餐，会员余额支付；商家后台接单出餐。

| 目录 | 说明 |
|---|---|
| `server/` | 后端：Spring Boot 3.3 + MyBatis-Plus + PostgreSQL 16 + Flyway |
| `customer-web/` | 顾客端 H5：Next.js App Router（静态导出，部署在 `/h5/`）+ antd-mobile + zustand |
| `merchant-web/` | 商家端：Vite 6 + React 18 + Ant Design 5 |
| `deploy/` | docker-compose、Nginx |
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
- [x] 数据看板区间统计（`GET /m/reports/summary`，任意日期区间最多 92 天：实收、订单数、日均、退款、每日曲线、菜品排行，与导出共用区间）；退款申请超过 2 小时未审核在商家端弹窗与工作台提醒（`new-count` 返回 `overdueRefundCount`）
- [x] **会员点餐、余额支付（不再接微信 / 支付宝支付）**：H5 与微信 / 支付宝小程序同一套流程——扫桌码随意浏览菜单，只在下单时登录会员账号（手机号 + 密码，由商家开通），从账户余额扣费；商家端「会员充值」开户 / 充值 / 流水 / 重置密码 / 停用；退款自动返还余额；流水与看板统计充值
- [x] 顾客端改为 `customer-web`（Next.js H5），停用并移除 Taro 小程序 `miniapp/`；桌码链接 `/q/<token>` 不变，Nginx 跳转到 `/h5/?token=<token>`
- [ ] 下一步：H5 真机验证（iOS Safari / 安卓微信、支付宝内置浏览器）、上线清单

## 本地开发

### 环境要求

- JDK 17 或 21、Maven 3.9+
- Node.js 20+
- Docker（运行 PostgreSQL 和集成测试）

### 1. 启动数据库

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

### 2. 启动后端

```bash
cd server
mvn spring-boot:run          # 默认 dev profile：自动建表 + 种子数据
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

### 4. 启动顾客 H5（customer-web）

```bash
cd customer-web
npm install
npm run dev                  # http://127.0.0.1:3000/h5/?token=dev-table-a1，/api、/uploads 代理到 8080（API_PROXY_TARGET 可改）
```

- 本地商家后台生成的桌码会直达 `customer-web`：`http://127.0.0.1:3000/h5/?token=<桌码token>`。手机真机扫码时，启动后端前设置 `QR_BASE_URL=http://<电脑局域网IP>:3000/h5/?token=`，例如 `QR_BASE_URL=http://192.168.1.10:3000/h5/?token= mvn spring-boot:run`。

- 开发种子会员：手机号 `13800000001`、密码 `staff123`；商家端「会员充值」可开户、充值
- 构建：`STATIC_EXPORT=true npm run build` → `out/`，docker-compose 挂载到 Nginx 的 `/h5/`
- 页面与约定见 [customer-web/README.md](customer-web/README.md)

## 关键约定

### H5 会员点餐与余额支付

- 桌码链接仍是 `/q/{qrToken}`，无需更换已张贴的二维码：Nginx 302 跳转到 `/h5/?token={qrToken}`，相机、微信、支付宝扫码都在浏览器里打开 H5 点餐（`customer-web`）。
- 顾客端只有 H5 一端，不调起微信 / 支付宝支付，也不用 openid 静默登录：顾客浏览菜单、加购不需要登录，**提交订单时**登录会员账号（`POST /api/v1/c/auth/password-login`），发起支付即从账户余额扣费并直接入账（`Platform.H5` → `BalancePayChannel`），余额不足返回 `42203`。
- 会员账号由商家在「会员充值」开户（手机号 + 初始密码），余额由店主线下收款后登记充值（`POST /api/v1/m/members/{id}/recharge`，仅店主）。取消订单 / 退款按退款单号幂等返还余额。
- 余额与流水：`customer.balance` 只能通过条件更新变动（扣费 `balance >= 金额`），每次变动写 `wallet_transaction`（充值 / 扣费 / 返还，含变动后余额），对账以流水为准。看板「会员充值」单独统计，属于预收款，不计入实收。
- 会员 token 带 `token_version`：重置密码、修改密码、停用后旧登录立即失效。
- 后端仍保留小程序静默登录与微信 / 支付宝渠道代码，但客户端不再调用；生产环境不配置这些参数也能运行会员余额模式。
- 小程序 `miniapp/` 已停用并从仓库移除（需要时可从 git 历史找回）。若之前在微信 / 支付宝后台配置过「扫普通链接二维码打开小程序」，需删除该规则，否则扫码仍会进小程序。

### 后端与协作约定

编码规范见 [docs/编码规范.md](docs/编码规范.md)；提交前运行 `mvn verify`（含 Checkstyle）与 merchant-web、customer-web 的 `npm run lint`。


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
5. 构建商家端与顾客 H5：`cd merchant-web && npm ci && npm run build`；`cd customer-web && npm ci && STATIC_EXPORT=true npm run build`
6. `cd deploy && docker compose up -d --build`
7. 首次启动会按 `BOOTSTRAP_*` 创建门店和店主账号，确认后把 `BOOTSTRAP_ENABLED` 改为 `false`
8. 手机打开 `https://<你的域名>/q/<桌码token>`，确认跳转到 `/h5/?token=…` 并显示店铺与桌号

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
