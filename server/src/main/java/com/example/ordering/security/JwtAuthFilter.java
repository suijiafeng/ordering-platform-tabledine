package com.example.ordering.security;

import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.tenant.StoreContext;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * JWT 认证过滤器。
 * <ol>
 *   <li>按路径前缀确定期望的 audience：/api/v1/c → customer，/api/v1/m → merchant</li>
 *   <li>token 无效 / 过期：不设置认证，由 Spring Security 返回 401</li>
 *   <li>token 有效但 audience 不匹配（顾客 token 调商家接口等）：直接返回 403</li>
 *   <li>员工 token：每次请求校验员工状态与 token_version（单店低并发，直接查库）</li>
 *   <li>员工请求注入门店上下文，供多租户插件使用；请求结束清理</li>
 * </ol>
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String CUSTOMER_PREFIX = "/api/v1/c/";
    public static final String MERCHANT_PREFIX = "/api/v1/m/";

    private final JwtService jwtService;
    private final StaffMapper staffMapper;
    private final JsonResponseWriter writer;

    public JwtAuthFilter(JwtService jwtService, StaffMapper staffMapper, JsonResponseWriter writer) {
        this.jwtService = jwtService;
        this.staffMapper = staffMapper;
        this.writer = writer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        try {
            UserType expected = expectedAudience(request.getRequestURI());
            String token = resolveToken(request);
            if (expected != null && token != null) {
                Optional<Claims> parsed = jwtService.parse(token);
                if (parsed.isPresent()) {
                    Claims claims = parsed.get();
                    UserType actual = JwtService.audienceOf(claims);
                    if (actual != null && actual != expected) {
                        if (isPublic(request)) {
                            // 公开接口带了另一端的旧 token：忽略 token，按未登录处理
                            chain.doFilter(request, response);
                            return;
                        }
                        writer.write(response, ErrorCode.FORBIDDEN);
                        return;
                    }
                    if (JwtService.TYPE_ACCESS.equals(claims.get(JwtService.CLAIM_TYPE, String.class))) {
                        authenticate(actual, claims);
                    }
                }
            }
            chain.doFilter(request, response);
        } finally {
            StoreContext.clear();
        }
    }

    private void authenticate(UserType type, Claims claims) {
        Long id = Long.valueOf(claims.getSubject());
        LoginUser user;
        List<SimpleGrantedAuthority> authorities = new ArrayList<>();
        if (type == UserType.CUSTOMER) {
            Platform platform = Platform.valueOf(claims.get(JwtService.CLAIM_PLATFORM, String.class));
            user = new LoginUser(UserType.CUSTOMER, id, null, null, platform);
            authorities.add(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
        } else if (type == UserType.STAFF) {
            Staff staff = staffMapper.selectById(id);
            Integer tv = claims.get(JwtService.CLAIM_TOKEN_VERSION, Integer.class);
            if (staff == null || !staff.isEnabled() || !Objects.equals(staff.getTokenVersion(), tv)) {
                return; // 员工已停用 / 改密 / 删除 → 401
            }
            user = new LoginUser(UserType.STAFF, id, staff.getStoreId(), staff.getRole(), null);
            authorities.add(new SimpleGrantedAuthority("ROLE_STAFF"));
            if (Staff.ROLE_OWNER.equals(staff.getRole())) {
                authorities.add(new SimpleGrantedAuthority("ROLE_OWNER"));
            }
            StoreContext.set(staff.getStoreId());
        } else {
            return;
        }
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(user, null, authorities);
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    /** 与 SecurityConfig 中的公开接口保持一致 */
    private static boolean isPublic(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri.startsWith("/api/v1/c/auth/")
                || uri.startsWith("/api/v1/c/qr/")
                || uri.equals("/api/v1/m/auth/login")
                || uri.equals("/api/v1/m/auth/refresh")
                || ("GET".equals(request.getMethod()) && uri.startsWith("/api/v1/c/stores/"));
    }

    static UserType expectedAudience(String uri) {
        if (uri.startsWith(CUSTOMER_PREFIX)) {
            return UserType.CUSTOMER;
        }
        if (uri.startsWith(MERCHANT_PREFIX)) {
            return UserType.STAFF;
        }
        return null;
    }

    private static String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7).trim();
            return token.isEmpty() ? null : token;
        }
        return null;
    }
}
