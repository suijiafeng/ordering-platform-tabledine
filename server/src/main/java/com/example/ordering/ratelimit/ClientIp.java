package com.example.ordering.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

/**
 * 获取客户端 IP。
 * 生产经 Nginx 反向代理，Nginx 覆盖设置 X-Real-IP；但只有请求确实来自可信代理（内网 / 本机 / 配置登记的地址）
 * 时才信任该头，否则后端端口一旦被直接暴露，客户端就能伪造 X-Real-IP 绕过限流和登录锁定。
 */
public final class ClientIp {

    private static volatile List<String> trustedProxies = List.of();

    private ClientIp() {
    }

    /** 由配置注入（见 WebMvcConfig） */
    public static void setTrustedProxies(List<String> prefixes) {
        trustedProxies = prefixes == null ? List.of() : prefixes.stream().map(String::trim).filter(p -> !p.isEmpty()).toList();
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
        for (String p : trustedProxies) {
            if (addr.equals(p) || addr.startsWith(p)) {
                return true;
            }
        }
        try {
            // 只解析字面量 IP，不做 DNS 查询
            if (!addr.matches("[0-9a-fA-F:.%]+")) {
                return false;
            }
            InetAddress a = InetAddress.getByName(addr);
            if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) {
                return true;
            }
            // IPv6 ULA fc00::/7（isSiteLocalAddress 只认已废弃的 fec0::/10）
            byte[] b = a.getAddress();
            return b.length == 16 && (b[0] & 0xfe) == 0xfc;
        } catch (UnknownHostException e) {
            return false;
        }
    }
}
