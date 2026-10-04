package com.example.ordering.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 启动安全检查：只有显式激活 dev / test profile 时才允许使用开发默认密钥。
 * 生产误配（漏设 profile）直接拒绝启动，而不是带着仓库里公开的开发密钥上线。
 */
@Component
public class StartupSafetyCheck implements InitializingBean {

    /** application-dev.yml 中的开发默认密钥片段 */
    static final String DEV_SECRET_MARKER = "dev-only-secret";

    private final Environment env;
    private final AppProperties props;

    public StartupSafetyCheck(Environment env, AppProperties props) {
        this.env = env;
        this.props = props;
    }

    public static boolean isDevOrTest(Environment env) {
        return env.matchesProfiles("dev", "test");
    }

    @Override
    public void afterPropertiesSet() {
        if (isDevOrTest(env)) {
            return;
        }
        List<String> problems = new ArrayList<>();
        String secret = props.getJwt().getSecret();
        if (secret != null && secret.contains(DEV_SECRET_MARKER)) {
            problems.add("JWT 使用了开发环境默认密钥");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("非 dev/test 环境拒绝启动：" + String.join("；", problems)
                    + "。生产请设置 SPRING_PROFILES_ACTIVE=prod 并通过环境变量注入密钥。");
        }
    }
}
