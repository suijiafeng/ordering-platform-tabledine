#!/bin/sh
# 一键部署 / 更新：校验配置 → 生成缺失的密钥 → 首次签发证书 → 构建并启动 → 等待就绪。
# 可以反复运行：更新版本时 git pull 后再跑一次即可。
set -eu
cd "$(dirname "$0")"

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\n错误：%s\n' "$1" >&2; exit 1; }

# ---------- 0. 环境 ----------
command -v docker >/dev/null 2>&1 || die "没有安装 Docker。安装方法：https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker 缺少 compose 子命令，请安装 Docker Compose v2"
docker info >/dev/null 2>&1 || die "当前用户无法使用 Docker：用 root 运行，或把用户加入 docker 组后重新登录"

# ---------- 1. 配置 ----------
if [ ! -f .env ]; then
  cp .env.example .env
  die "已生成 deploy/.env，请打开填写 DOMAIN、ACME_EMAIL、BOOTSTRAP_STORE_NAME、BOOTSTRAP_OWNER_PASSWORD 后重新运行"
fi

get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
set_var() {  # set_var KEY VALUE：改写 .env 中的一行
  if grep -qE "^$1=" .env; then
    sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n=/+' | cut -c1-48
  else
    head -c 36 /dev/urandom | base64 | tr -d '\n=/+'
  fi
}

DOMAIN=$(get DOMAIN); ACME_EMAIL=$(get ACME_EMAIL)
[ -n "$DOMAIN" ] && [ "$DOMAIN" != "ordering.example.com" ] || die "请在 deploy/.env 填写 DOMAIN（已解析到本机的域名）"
[ -n "$ACME_EMAIL" ] && [ "$ACME_EMAIL" != "admin@example.com" ] || die "请在 deploy/.env 填写 ACME_EMAIL（接收证书到期提醒的邮箱）"

# 数据库密码与 JWT 密钥不需要人记，留空就自动生成并写回 .env
[ -n "$(get DB_USERNAME)" ] || set_var DB_USERNAME ordering
case "$(get DB_PASSWORD)" in ''|'请改成强密码') set_var DB_PASSWORD "$(random_secret)"; say "已生成数据库密码（写在 .env）";; esac
[ -n "$(get JWT_SECRET)" ] || { set_var JWT_SECRET "$(random_secret)"; say "已生成 JWT_SECRET（写在 .env）"; }

FIRST_RUN=0
if ! docker volume inspect ordering_pgdata >/dev/null 2>&1; then
  FIRST_RUN=1
  # 首次部署需要店主初始账号；之后账号在后台管理，这些值不再使用
  [ -n "$(get BOOTSTRAP_STORE_NAME)" ] || die "首次部署请在 .env 填写 BOOTSTRAP_STORE_NAME（店名）"
  [ -n "$(get BOOTSTRAP_OWNER_USERNAME)" ] || set_var BOOTSTRAP_OWNER_USERNAME owner
  PW=$(get BOOTSTRAP_OWNER_PASSWORD)
  case "$PW" in ''|*请改*) die "首次部署请在 .env 填写 BOOTSTRAP_OWNER_PASSWORD（店主初始密码，至少 8 位）";; esac
  [ ${#PW} -ge 8 ] || die "BOOTSTRAP_OWNER_PASSWORD 至少 8 位"
  set_var BOOTSTRAP_ENABLED true
fi

# ---------- 2. 证书 ----------
if docker run --rm -v ordering_certbot-conf:/etc/letsencrypt alpine test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
  say "证书已存在：$DOMAIN"
else
  say "首次签发证书：$DOMAIN（需要域名已解析到本机，且 80 端口可用）"
  docker compose stop nginx >/dev/null 2>&1 || true
  docker run --rm -p 80:80 -v ordering_certbot-conf:/etc/letsencrypt certbot/certbot certonly --standalone \
    -d "$DOMAIN" --agree-tos -m "$ACME_EMAIL" --non-interactive \
    || die "签发证书失败。请确认：域名 $DOMAIN 已解析到本机公网 IP；80 端口没有被其他程序占用"
fi

# ---------- 3. 构建并启动 ----------
say "构建镜像并启动（第一次需要几分钟）"
docker compose up -d --build --remove-orphans

say "等待后端就绪"
i=0
backend_health() { docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q backend)" 2>/dev/null || true; }
until [ "$(backend_health)" = "healthy" ]; do
  i=$((i+1))
  if [ $i -gt 36 ]; then
    printf '\n后端在 3 分钟内没有就绪，最近日志：\n'; docker compose logs --tail=40 backend
    die "后端启动失败，请根据上面的日志排查（配置缺失时会打印原因）"
  fi
  sleep 5
done

# 首次初始化成功后关闭 BOOTSTRAP：之后账号都在后台管理，重启不再尝试初始化
[ $FIRST_RUN -eq 1 ] && set_var BOOTSTRAP_ENABLED false

say "部署完成"
docker compose ps
printf '\n商家后台：https://%s/\n顾客端：  扫桌码，或打开 https://%s/h5/\n' "$DOMAIN" "$DOMAIN"
if [ $FIRST_RUN -eq 1 ]; then
  printf '店主账号：%s（密码是 .env 里的 BOOTSTRAP_OWNER_PASSWORD），登录后请立即在右上角修改密码。\n' "$(get BOOTSTRAP_OWNER_USERNAME)"
  printf '接下来：店铺设置 → 录入菜品 → 桌台管理里下载桌码并张贴。\n'
fi
