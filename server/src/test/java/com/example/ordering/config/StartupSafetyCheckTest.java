package com.example.ordering.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StartupSafetyCheckTest {

    private static AppProperties props(boolean authMock, boolean payMock, String secret) {
        AppProperties p = new AppProperties();
        p.getAuth().setMockEnabled(authMock);
        p.getPay().setMockEnabled(payMock);
        p.getJwt().setSecret(secret);
        return p;
    }

    @Test
    void refusesMockOrDevSecretOutsideDevAndTest() {
        MockEnvironment noProfile = new MockEnvironment();
        assertThatThrownBy(() -> new StartupSafetyCheck(noProfile, props(true, false, "x".repeat(40))).afterPropertiesSet())
                .hasMessageContaining("mock-enabled");
        assertThatThrownBy(() -> new StartupSafetyCheck(noProfile, props(false, true, "x".repeat(40))).afterPropertiesSet())
                .hasMessageContaining("模拟支付");
        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("production");
        assertThatThrownBy(() -> new StartupSafetyCheck(production,
                props(false, false, "dev-only-secret-please-change-0123456789abcdef")).afterPropertiesSet())
                .hasMessageContaining("开发环境默认密钥");
    }

    @Test
    void allowsSafeProdAndDevConveniences() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatCode(() -> new StartupSafetyCheck(prod, props(false, false, "a-real-secret-0123456789-0123456789")).afterPropertiesSet())
                .doesNotThrowAnyException();
        MockEnvironment dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        assertThatCode(() -> new StartupSafetyCheck(dev, props(true, true, "dev-only-secret-please-change-0123456789abcdef")).afterPropertiesSet())
                .doesNotThrowAnyException();
    }
}
