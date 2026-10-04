package com.example.ordering.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 获取客户端 IP：生产环境经 Nginx 反向代理，取 X-Real-IP（由 Nginx 设置，客户端无法伪造）。
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String of(HttpServletRequest request) {
        String ip = request.getHeader("X-Real-IP");
        if (ip != null && !ip.isBlank()) {
            return ip.trim();
        }
        return request.getRemoteAddr();
    }
}
