# 点餐平台

单店堂食扫码点餐：顾客用手机扫桌码进入 H5 点餐，会员余额支付；商家后台接单、出餐、退款，管理菜品、桌台、会员和员工。

| 目录 | 说明 |
|---|---|
| `server/` | 后端：Spring Boot 3.3 + MyBatis-Plus + PostgreSQL 16 + Flyway |
| `customer-web/` | 顾客端 H5：Next.js（静态导出，部署在 `/h5/`）+ antd-mobile |
| `merchant-web/` | 商家后台：Vite + React 18 + Ant Design 5 |
| `deploy/` | 生产部署：docker-compose、镜像、证书脚本 |
| `docs/` | 文档 |

文档：

- [项目架构](docs/项目架构.md)：整体结构、核心流程、全局约定。接手先读这篇
- [部署](deploy/README.md)：首次部署、更新、运维、常见问题
- [上线清单](docs/上线清单.md)、[编码规范](docs/编码规范.md)
- [customer-web/README.md](customer-web/README.md)：顾客端页面与约定

## 本地开发

需要 JDK 17+、Maven 3.9+、Node.js 20+、Docker。

```bash
# 1. 数据库
docker compose -f deploy/docker-compose.dev.yml up -d

# 2. 后端（dev profile：自动建表 + 种子数据），接口文档 http://localhost:8080/swagger-ui.html
cd server && mvn spring-boot:run

# 3. 商家后台 http://localhost:5173
cd merchant-web && npm install && npm run dev

# 4. 顾客端 http://127.0.0.1:3000/h5/?token=dev-table-a1
cd customer-web && npm install && npm run dev
```

种子数据：店主 `admin / admin123`，店员 `staff / staff123`，会员 `13800000001 / staff123`，桌码 `dev-table-a1` ~ `a3`。两个前端的 `/api` 都代理到 8080。

手机真机扫本地桌码：启动后端时设置 `QR_BASE_URL=http://<电脑局域网IP>:3000/h5/?token=`。

## 测试与检查

```bash
cd server && mvn verify                       # Checkstyle + 全部测试（集成测试用 Testcontainers 起 PostgreSQL，需要 Docker）
cd server && mvn verify -DargLine="-Dapi.version=1.44"   # Docker 29+ 需要加这个参数，否则集成测试被静默跳过
cd merchant-web && npm run lint && npm run build
cd customer-web && npm run lint && npm run typecheck
```

CI（`.github/workflows/ci.yml`）对三个部分分别跑以上检查，并验证后端和前端镜像能构建。

## 生产部署

一台装了 Docker 的服务器即可，前端和后端都在容器里构建。详见 [deploy/README.md](deploy/README.md)。

```bash
cd deploy
cp .env.example .env && vi .env     # 填 4 项：域名、邮箱、店名、店主初始密码
./deploy.sh                         # 签证书、构建、启动、等待就绪；更新版本时再跑一次
```

## 协作约定

- 金额全部以「分」为单位的整数；数据库变更只通过新增 Flyway 脚本。其余业务约定见 [项目架构](docs/项目架构.md)
- 提交前跑一遍上面的检查；提交信息 `feat|fix|refactor|docs|test|chore: 描述`
- 分支：`main`（可发布）← `develop` ← `feature/*`
