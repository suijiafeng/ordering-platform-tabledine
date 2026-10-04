package com.example.ordering.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * 获取客户端 IP。
 * 生产经 Nginx 反向代理，Nginx 覆盖设置 X-Real-IP；但只有请求确实来自内网 / 本机（即代理）时才信任该头，
 * 否则后端端口一旦被直接暴露，客户端就能伪造 X-Real-IP 绕过限流和登录锁定。
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String of(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        String ip = request.getHeader("X-Real-IP");
        if (ip != null && !ip.isBlank() && isTrustedProxy(remote)) {
            return ip.trim();
        }
        return remote;
    }

    static boolean isTrustedProxy(String addr) {
        if (addr == null || addr.isBlank()) {
            return false;
        }
        try {
            // 只解析字面量 IP，不做 DNS 查询
            if (!addr.matches("[0-9a-fA-F:.]+")) {
                return false;
            }
            InetAddress a = InetAddress.getByName(addr);
            return a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress();
        } catch (UnknownHostException e) {
            return false;
        }
    }
}
