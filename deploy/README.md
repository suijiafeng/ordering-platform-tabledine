# 部署

一台装了 Docker 的 Linux 服务器就够。所有东西都在容器里构建和运行，服务器上不需要 Java、Node 或 PostgreSQL。

## 准备

- 一个域名，已解析到这台服务器，并完成 ICP 备案（微信 / 支付宝内置浏览器打开未备案域名会被拦截）
- 服务器安装 Docker（含 `docker compose` 子命令），开放 80 和 443 端口
- 把仓库放到服务器上（`git clone`）

## 第一次部署

```bash
cd deploy
cp .env.example .env
vi .env          # 只需填 4 项：DOMAIN、ACME_EMAIL、BOOTSTRAP_STORE_NAME、BOOTSTRAP_OWNER_PASSWORD
./deploy.sh
```

`deploy.sh` 会依次：检查 Docker → 校验 `.env` 并自动生成数据库密码和 JWT 密钥 → 签发 HTTPS 证书 → 构建前端和后端镜像 → 启动 → 等后端就绪 → 打印后台地址和店主账号。第一次要几分钟，结束时会显示「部署完成」。

然后用店主账号登录 `https://<域名>/`，立刻改密码，在店铺设置里填好信息，录入菜品和桌台，下载桌码张贴。手机扫一个桌码确认能打开点餐页。

## 更新版本

```bash
git pull
cd deploy && ./deploy.sh
```

证书已有就跳过签发；数据库结构升级由后端启动时自动执行。

## 各服务

| 服务 | 作用 | 数据 |
|---|---|---|
| nginx | 唯一对外入口。提供商家后台（`/`）和顾客端（`/h5/`）的静态文件，把 `/api/` 转发给后端，`/q/<桌码>` 跳转到顾客端；每 6 小时 reload 一次让续期的证书生效 | 证书卷、图片卷（只读） |
| backend | Spring Boot 后端，启动时自动升级数据库结构 | 图片卷 `uploads` |
| postgres | 数据库 | 数据卷 `pgdata` |
| certbot | 每 12 小时检查证书并自动续期 | 证书卷 `certbot-conf` |

前端镜像的构建过程在 [nginx/Dockerfile](nginx/Dockerfile)：先在 Node 镜像里构建两个前端，再把产物放进 nginx 镜像。nginx 配置是 [nginx/templates/ordering.conf.template](nginx/templates/ordering.conf.template)，启动时把其中的 `${DOMAIN}` 替换成 `.env` 里的域名。

## 日常运维

```bash
docker compose ps                              # 四个服务应为 running / healthy
docker compose logs -f backend                 # 看后端日志（退款失败、定时任务异常记为 ERROR / WARN）

# 备份数据库（建议放进 cron 每天一次，保留 7 天以上）
docker compose exec -T postgres pg_dump -U ordering ordering | gzip > /backup/ordering-$(date +%F).sql.gz
# 恢复
gunzip -c /backup/ordering-2026-10-05.sql.gz | docker compose exec -T postgres psql -U ordering ordering
```

探活地址：`https://<域名>/api/v1/c/stores/1`（返回店铺信息即正常）。

## 常见问题

- **`deploy.sh` 报「签发证书失败」**：域名没有解析到这台机器，或 80 端口被别的程序占用（`ss -ltnp | grep :80`）。
- **报「后端启动失败」**：脚本会打印最近的后端日志，照着提示改 `.env` 后重新运行即可。
- **改了域名**：改 `.env` 的 `DOMAIN` 后重新运行 `./deploy.sh`，会为新域名签证书并重新渲染 nginx 配置。
- **重置所有数据**（只在测试阶段用）：`docker compose down -v` 会删掉数据库、图片和证书，之后 `./deploy.sh` 会按首次部署重新初始化。
- **只想在本机跑起来看看**：不需要这套编排。按仓库根目录 README 的「本地开发」，用 `docker-compose.dev.yml` 只起一个数据库，其余在本机运行。
