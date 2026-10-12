#!/bin/sh
set -eu

# 官方 entrypoint 完成模板渲染后启动此钩子，随后仍由 nginx 作为 PID 1 运行。
# 定期重载 certbot 更新的证书；第一次等待后主进程已经就绪。
(
    while sleep 6h; do
        nginx -s reload || echo 'Certificate reload failed; retrying in 6 hours' >&2
    done
) &
