package com.example.ordering.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 应用自定义配置（前缀 app）。敏感项全部通过环境变量注入，不写入代码仓库。
 */
@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Auth auth = new Auth();
    private Cors cors = new Cors();
    private Security security = new Security();
    private Bootstrap bootstrap = new Bootstrap();
    private Qr qr = new Qr();
    private Storage storage = new Storage();
    private RateLimit rateLimit = new RateLimit();
    private Refund refund = new Refund();

    /** 退款补偿 */
    @Data
    public static class Refund {
        /** 退款单处理中超过该时长仍无结果时，定时任务按钱包流水查询并重试 */
        private Duration queryAfter = Duration.ofMinutes(3);
    }

    @Data
    public static class Qr {
        /** 桌码链接前缀，完整链接 = baseUrl + qrToken；Nginx 把 /q/<token> 跳转到顾客 H5 */
        private String baseUrl = "https://ordering.example.com/q/";
    }

    @Data
    public static class Storage {
        /** 本地存储目录（生产为 Docker 卷 /data/uploads） */
        private String localDir = "/data/uploads";
        /** 对外访问路径前缀（生产由 Nginx 提供静态访问） */
        private String publicPath = "/uploads/";
        /** 由后端直接提供静态访问（仅开发环境，生产交给 Nginx） */
        private boolean serveLocal = false;
        /** 主图最长边像素 */
        private int maxSize = 1080;
        /** 缩略图最长边像素 */
        private int thumbSize = 400;
    }

    @Data
    public static class RateLimit {
        private boolean enabled = true;
    }

    @Data
    public static class Jwt {
        /** HMAC 密钥，至少 32 字节 */
        private String secret;
        private String issuer = "ordering-platform";
        /** 会员 token 有效期：过期后需重新输入密码 */
        private Duration memberTtl = Duration.ofDays(7);
        /** 员工 access token 有效期 */
        private Duration staffAccessTtl = Duration.ofHours(2);
        /** 员工 refresh token 有效期 */
        private Duration staffRefreshTtl = Duration.ofDays(14);
    }

    @Data
    public static class Auth {
        /** 员工登录：连续失败次数上限 */
        private int maxLoginFailures = 5;
        /** 员工登录：锁定时长 */
        private Duration lockDuration = Duration.ofMinutes(15);
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>();
    }

    @Data
    public static class Security {
        /** 额外信任 X-Real-IP 的反向代理地址（IP 或前缀，如 10.0. / 2001:db8:）；内网与本机默认信任 */
        private List<String> trustedProxies = new ArrayList<>();
    }

    /** 首次部署时自动创建门店和店主账号（库中没有任何门店时生效） */
    @Data
    public static class Bootstrap {
        private boolean enabled = false;
        private String storeName;
        private String ownerUsername;
        private String ownerPassword;
        private String ownerName = "店主";
    }
}
