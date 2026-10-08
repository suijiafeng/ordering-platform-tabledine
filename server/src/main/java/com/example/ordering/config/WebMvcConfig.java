package com.example.ordering.config;

import com.example.ordering.module.audit.web.AuditInterceptor;
import com.example.ordering.ratelimit.RateLimitInterceptor;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Paths;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import com.example.ordering.ratelimit.ClientIp;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @jakarta.annotation.PostConstruct
    void initTrustedProxies() {
        ClientIp.setTrustedProxies(appProperties.getSecurity().getTrustedProxies());
    }

    private final RateLimitInterceptor rateLimitInterceptor;
    private final AuditInterceptor auditInterceptor;
    private final AppProperties appProperties;

    public WebMvcConfig(RateLimitInterceptor rateLimitInterceptor, AuditInterceptor auditInterceptor, AppProperties appProperties) {
        this.rateLimitInterceptor = rateLimitInterceptor;
        this.auditInterceptor = auditInterceptor;
        this.appProperties = appProperties;
    }

    /** 开发环境由后端直接提供上传图片的静态访问；生产环境由 Nginx 提供 */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        AppProperties.Storage storage = appProperties.getStorage();
        if (storage.isServeLocal()) {
            // 目录尚不存在时 toUri() 不带结尾斜杠，资源位置必须以 / 结尾
            String location = Paths.get(storage.getLocalDir()).toAbsolutePath().normalize().toUri().toString();
            if (!location.endsWith("/")) {
                location = location + "/";
            }
            registry.addResourceHandler(storage.getPublicPath() + "**").addResourceLocations(location);
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 审计放在最前：后面的限流拒绝（429）也会被记录
        registry.addInterceptor(auditInterceptor).addPathPatterns("/api/**");
        registry.addInterceptor(rateLimitInterceptor).addPathPatterns("/api/**");
    }
}
