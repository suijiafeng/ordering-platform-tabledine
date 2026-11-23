#!/bin/sh
# 在 CI 已构建的生产镜像上验证入口、模板渲染和两个静态站点；不启动真实业务服务。
set -eu
image=${1:-ordering-web:ci}
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
name="ordering-nginx-test-$$"
export DOMAIN=ordering.test DB_USERNAME=test DB_PASSWORD=test JWT_SECRET=test
cleanup() {
    docker rm -f "$name" "$name-backend" >/dev/null 2>&1 || true
    docker network rm "$name" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM

# Compose 不能覆盖 nginx CMD，否则官方入口会跳过 envsubst。
docker compose -f "$root/deploy/docker-compose.yml" config --format json > "$work/compose.json"
python3 - "$work/compose.json" <<'PY'
import json
import sys
service = json.load(open(sys.argv[1]))['services']['nginx']
assert not service.get('command'), 'nginx must retain the official image CMD'
assert not service.get('entrypoint'), 'nginx must retain the official image entrypoint'
PY
mkdir -p "$work/certs/live/$DOMAIN"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$DOMAIN" \
    -keyout "$work/certs/live/$DOMAIN/privkey.pem" \
    -out "$work/certs/live/$DOMAIN/fullchain.pem" >/dev/null 2>&1
docker network create "$name" >/dev/null
# 仅提供 upstream DNS 解析；测试不调用业务 API。
docker run -d --name "$name-backend" --network "$name" --network-alias backend \
    "$image" /bin/sh -c 'sleep 120' >/dev/null
docker run -d --name "$name" --network "$name" -e DOMAIN \
    -v "$work/certs:/etc/letsencrypt:ro" "$image" >/dev/null
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if docker exec "$name" wget --no-check-certificate -qO /dev/null https://127.0.0.1/ 2>/dev/null; then ready=true; break; fi
    sleep 1
done
if [ "$ready" != true ]; then docker logs "$name"; exit 1; fi
docker exec "$name" nginx -T > "$work/nginx.conf" 2>&1
grep -q 'server_name ordering.test;' "$work/nginx.conf"
grep -q '/etc/letsencrypt/live/ordering.test/fullchain.pem' "$work/nginx.conf"
if grep -q '\${DOMAIN}' "$work/nginx.conf"; then echo 'Unrendered DOMAIN' >&2; exit 1; fi
docker exec "$name" cat /proc/1/comm | grep -qx nginx
for path in / /h5/; do
    docker exec "$name" wget --no-check-certificate -qO- "https://127.0.0.1$path" > "$work/page.html"
    grep -qi '<html' "$work/page.html"
    if grep -q 'Welcome to nginx!' "$work/page.html"; then exit 1; fi
done
# 商家端主包：gzip 压缩、长期缓存；入口页不缓存；安全头仍在
asset=$(docker exec "$name" sh -c 'ls /usr/share/nginx/merchant/assets/*.js | head -n 1 | xargs basename')
docker exec "$name" wget --no-check-certificate -S --header='Accept-Encoding: gzip' -qO /dev/null "https://127.0.0.1/assets/$asset" 2> "$work/asset.headers"
grep -qi 'Content-Encoding: gzip' "$work/asset.headers"
grep -qi 'Cache-Control: public, max-age=31536000, immutable' "$work/asset.headers"
grep -qi 'Content-Security-Policy' "$work/asset.headers"
docker exec "$name" wget --no-check-certificate -S -qO /dev/null https://127.0.0.1/ 2> "$work/index.headers"
grep -qi 'Cache-Control: no-cache' "$work/index.headers"
grep -qi 'X-Frame-Options' "$work/index.headers"
echo 'Production nginx startup, rendered domain, PID 1, both web routes, gzip and cache headers passed.'
