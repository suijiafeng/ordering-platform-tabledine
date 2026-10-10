package com.example.ordering.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpMethod;
import org.springframework.util.AntPathMatcher;

import java.util.List;

/**
 * 无需登录即可访问的接口，唯一定义处：
 * SecurityConfig 据此放行，JwtAuthFilter 据此决定「公开接口带了另一端的旧 token」时忽略 token 而不是 403。
 * 新增公开接口只改这里。
 */
public final class PublicEndpoints {

    /** 任意方法都公开的路径（Ant 风格） */
    public static final List<String> ANY_METHOD = List.of(
            "/api/v1/c/auth/**",
            "/api/v1/c/qr/**",
            "/api/v1/m/auth/login",
            "/api/v1/m/auth/refresh",
            "/actuator/health",
            "/uploads/**",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/error"
    );

    /** 仅 GET 公开：店铺信息与菜单允许未登录浏览 */
    public static final List<String> GET_ONLY = List.of(
            "/api/v1/c/stores/**"
    );

    /** 登录 / 刷新接口：不解析请求头里的旧 token（否则旧 token 会注入门店上下文，换门店账号登录被误判为密码错误） */
    public static final List<String> AUTH = List.of(
            "/api/v1/c/auth/**",
            "/api/v1/m/auth/login",
            "/api/v1/m/auth/refresh"
    );

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private PublicEndpoints() {
    }

    public static boolean isPublic(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (matchesAny(ANY_METHOD, uri)) {
            return true;
        }
        return HttpMethod.GET.matches(request.getMethod()) && matchesAny(GET_ONLY, uri);
    }

    public static boolean isAuthEndpoint(String uri) {
        return matchesAny(AUTH, uri);
    }

    private static boolean matchesAny(List<String> patterns, String uri) {
        return patterns.stream().anyMatch(p -> MATCHER.match(p, uri));
    }
}
