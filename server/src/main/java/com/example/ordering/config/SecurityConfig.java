package com.example.ordering.config;

import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.BusinessException;
import com.example.ordering.security.JwtAuthFilter;
import com.example.ordering.security.PublicEndpoints;
import com.example.ordering.security.RestAccessDeniedHandler;
import com.example.ordering.security.RestAuthenticationEntryPoint;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthFilter jwtAuthFilter,
                                                   RestAuthenticationEntryPoint entryPoint,
                                                   RestAccessDeniedHandler accessDeniedHandler) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {})
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(auth -> auth
                        // 公开接口统一定义在 PublicEndpoints，JwtAuthFilter 也用同一份
                        .requestMatchers(PublicEndpoints.ANY_METHOD.toArray(String[]::new)).permitAll()
                        .requestMatchers(HttpMethod.GET, PublicEndpoints.GET_ONLY.toArray(String[]::new)).permitAll()
                        .requestMatchers("/api/v1/c/**").hasRole("CUSTOMER")
                        .requestMatchers("/api/v1/m/**").hasRole("STAFF")
                        .anyRequest().denyAll())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** JwtAuthFilter 只挂在 Security 过滤链中，避免被 Servlet 容器重复注册 */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(JwtAuthFilter filter) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();
        // BCrypt 只使用前 72 字节：DTO 按字符数限制 64，但 64 个汉字是 192 字节，超出部分会被忽略（或在新版 Spring 中抛异常变成 500）。
        // 设置密码时明确拒绝；比对时超长输入不可能是已保存的密码，直接判不匹配
        return new PasswordEncoder() {
            @Override
            public String encode(CharSequence raw) {
                if (utf8Length(raw) > BCRYPT_MAX_BYTES) {
                    throw new BusinessException(ErrorCode.PARAM_INVALID, "密码过长：不超过 72 个字节（约 24 个汉字）");
                }
                return bcrypt.encode(raw);
            }

            @Override
            public boolean matches(CharSequence raw, String encoded) {
                return raw != null && utf8Length(raw) <= BCRYPT_MAX_BYTES && bcrypt.matches(raw, encoded);
            }
        };
    }

    private static final int BCRYPT_MAX_BYTES = 72;

    private static int utf8Length(CharSequence s) {
        return s == null ? 0 : s.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
    }

    /** 商家端跨域（生产环境同域部署，通常只在开发环境需要） */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(AppProperties appProperties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(appProperties.getCors().getAllowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
