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
    private Wechat wechat = new Wechat();
    private Alipay alipay = new Alipay();
    private Cors cors = new Cors();
    private Bootstrap bootstrap = new Bootstrap();
    private Qr qr = new Qr();
    private Storage storage = new Storage();
    private RateLimit rateLimit = new RateLimit();
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
    private Pay pay = new Pay();
    private WechatPay wechatPay = new WechatPay();

    /** 支付通用配置 */
    @Data
    public static class Pay {
        /** 开发环境：不调用真实渠道，支付 / 退款由 Mock 渠道模拟 */
        private boolean mockEnabled = false;
        /** 对外公网地址（不带结尾斜杠），用于拼接渠道异步通知 URL，如 https://ordering.example.com */
        private String notifyBaseUrl = "";
        /** 退款单处理中超过该时长仍无结果时，定时任务主动向渠道查询 */
        private Duration refundQueryAfter = Duration.ofMinutes(3);
        /** 待支付订单创建超过该时长且仍未收到回调时，定时任务主动查单 */
        private Duration payQueryAfter = Duration.ofMinutes(2);
    }

    /** 微信支付 APIv3（JSAPI，小程序 appId 复用 app.wechat.app-id） */
    @Data
    public static class WechatPay {
        private String mchId;
        /** 商户 API 证书序列号 */
        private String serialNo;
        /** 商户 API 私钥（PKCS8，Base64，无头尾） */
        private String privateKey;
        /** APIv3 密钥（32 字节），用于解密回调 */
        private String apiV3Key;
        /** 微信支付公钥 ID（PUB_KEY_ID_xxx）与公钥（Base64，无头尾），用于回调验签 */
        private String platformPublicKeyId;
        private String platformPublicKey;
        private String apiBase = "https://api.mch.weixin.qq.com";
    }
<<<<<<< HEAD
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)

    @Data
    public static class Qr {
        /** 桌码链接前缀，完整链接 = baseUrl + qrToken；需与小程序后台配置的普通二维码规则一致 */
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
        /** 顾客 token 有效期（过期后小程序静默重登，不设 refresh） */
        private Duration customerTtl = Duration.ofHours(2);
        /** 员工 access token 有效期 */
        private Duration staffAccessTtl = Duration.ofHours(2);
        /** 员工 refresh token 有效期 */
        private Duration staffRefreshTtl = Duration.ofDays(14);
    }

    @Data
    public static class Auth {
        /** 开发环境：小程序登录不调用真实平台接口 */
        private boolean mockEnabled = false;
        /** 员工登录：连续失败次数上限 */
        private int maxLoginFailures = 5;
        /** 员工登录：锁定时长 */
        private Duration lockDuration = Duration.ofMinutes(15);
    }

    @Data
    public static class Wechat {
        private String appId;
        private String appSecret;
        private String apiBase = "https://api.weixin.qq.com";
    }

    @Data
    public static class Alipay {
        private String appId;
        /** 应用私钥（PKCS8，Base64，无头尾） */
        private String privateKey;
        /** 支付宝公钥（Base64，无头尾），用于验签（支付模块使用） */
        private String alipayPublicKey;
        private String gateway = "https://openapi.alipay.com/gateway.do";
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>();
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
