package com.example.ordering.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StartupSafetyCheckTest {

    private static final String DEV_SECRET = "dev-only-secret-please-change-0123456789abcdef";

    private static AppProperties props(String secret) {
        AppProperties p = new AppProperties();
        p.getJwt().setSecret(secret);
        return p;
    }

    @Test
    void refusesDevSecretOutsideDevAndTest() {
        MockEnvironment noProfile = new MockEnvironment();
        assertThatThrownBy(() -> new StartupSafetyCheck(noProfile, props(DEV_SECRET)).afterPropertiesSet())
                .hasMessageContaining("开发环境默认密钥");
        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("production");
        assertThatThrownBy(() -> new StartupSafetyCheck(production, props(DEV_SECRET)).afterPropertiesSet())
                .hasMessageContaining("开发环境默认密钥");
    }

    @Test
    void allowsRealSecretInProdAndDevSecretInDev() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatCode(() -> new StartupSafetyCheck(prod, props("a-real-secret-0123456789-0123456789")).afterPropertiesSet())
                .doesNotThrowAnyException();
        MockEnvironment dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        assertThatCode(() -> new StartupSafetyCheck(dev, props(DEV_SECRET)).afterPropertiesSet())
                .doesNotThrowAnyException();
    }
}
