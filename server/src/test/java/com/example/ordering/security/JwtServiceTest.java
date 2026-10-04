package com.example.ordering.security;

import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.staff.entity.Staff;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(props("unit-test-secret-0123456789abcdef0123456789"));
    }

    @Test
    void customerTokenCarriesAudienceAndPlatform() {
        String token = jwtService.issueCustomerToken(42L, Platform.ALIPAY).token();
        Claims claims = jwtService.parse(token).orElseThrow();
        assertThat(JwtService.audienceOf(claims)).isEqualTo(UserType.CUSTOMER);
        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.get(JwtService.CLAIM_PLATFORM, String.class)).isEqualTo("ALIPAY");
        assertThat(claims.get(JwtService.CLAIM_TYPE, String.class)).isEqualTo(JwtService.TYPE_ACCESS);
    }

    @Test
    void staffTokensCarryTokenVersion() {
        Staff staff = new Staff();
        staff.setId(7L);
        staff.setStoreId(1L);
        staff.setRole(Staff.ROLE_OWNER);
        staff.setTokenVersion(3);

        Claims access = jwtService.parse(jwtService.issueStaffAccessToken(staff).token()).orElseThrow();
        assertThat(JwtService.audienceOf(access)).isEqualTo(UserType.STAFF);
        assertThat(access.get(JwtService.CLAIM_TOKEN_VERSION, Integer.class)).isEqualTo(3);
        assertThat(access.get(JwtService.CLAIM_STORE, Long.class)).isEqualTo(1L);

        Claims refresh = jwtService.parse(jwtService.issueStaffRefreshToken(staff).token()).orElseThrow();
        assertThat(refresh.get(JwtService.CLAIM_TYPE, String.class)).isEqualTo(JwtService.TYPE_REFRESH);
    }

    @Test
    void rejectsTamperedOrForeignToken() {
        String token = jwtService.issueCustomerToken(1L, Platform.WECHAT).token();
        assertThat(jwtService.parse(token + "x")).isEmpty();

        JwtService other = new JwtService(props("another-secret-0123456789abcdef0123456789"));
        assertThat(other.parse(token)).isEmpty();
        assertThat(jwtService.parse("not-a-jwt")).isEmpty();
        assertThat(jwtService.parse(null)).isEmpty();
    }

    @Test
    void rejectsExpiredToken() {
        AppProperties p = props("unit-test-secret-0123456789abcdef0123456789");
        p.getJwt().setCustomerTtl(Duration.ofSeconds(-1));
        JwtService expiring = new JwtService(p);
        String token = expiring.issueCustomerToken(1L, Platform.WECHAT).token();
        assertThat(expiring.parse(token)).isEmpty();
    }

    @Test
    void refusesShortSecret() {
        assertThatThrownBy(() -> new JwtService(props("too-short")))
                .isInstanceOf(IllegalStateException.class);
    }

    private static AppProperties props(String secret) {
        AppProperties p = new AppProperties();
        p.getJwt().setSecret(secret);
        return p;
    }
}
