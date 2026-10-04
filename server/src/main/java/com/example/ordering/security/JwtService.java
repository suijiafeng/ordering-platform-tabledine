package com.example.ordering.security;

import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.staff.entity.Staff;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

/**
 * JWT 签发与校验。
 * <ul>
 *   <li>顾客：audience = customer，仅 access token（过期后小程序静默重登）</li>
 *   <li>员工：audience = merchant，access + refresh；携带 token_version，停用 / 改密后旧 token 失效</li>
 * </ul>
 */
@Service
public class JwtService {

    public static final String CLAIM_TYPE = "typ";
    public static final String CLAIM_PLATFORM = "plat";
    public static final String CLAIM_STORE = "sid";
    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_TOKEN_VERSION = "tv";

    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    private final AppProperties.Jwt props;
    private final SecretKey key;

    public JwtService(AppProperties appProperties) {
        this.props = appProperties.getJwt();
        String secret = props.getSecret();
        if (!StringUtils.hasText(secret) || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("app.jwt.secret 未配置或长度不足 32 字节（环境变量 JWT_SECRET）");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /** 签发结果 */
    public record IssuedToken(String token, long expiresInSeconds) {
    }

    public IssuedToken issueCustomerToken(Long customerId, Platform platform) {
        Duration ttl = props.getCustomerTtl();
        String token = baseBuilder(UserType.CUSTOMER, customerId, TYPE_ACCESS, ttl)
                .claim(CLAIM_PLATFORM, platform.name())
                .compact();
        return new IssuedToken(token, ttl.toSeconds());
    }

    public IssuedToken issueStaffAccessToken(Staff staff) {
        Duration ttl = props.getStaffAccessTtl();
        String token = baseBuilder(UserType.STAFF, staff.getId(), TYPE_ACCESS, ttl)
                .claim(CLAIM_STORE, staff.getStoreId())
                .claim(CLAIM_ROLE, staff.getRole())
                .claim(CLAIM_TOKEN_VERSION, staff.getTokenVersion())
                .compact();
        return new IssuedToken(token, ttl.toSeconds());
    }

    public IssuedToken issueStaffRefreshToken(Staff staff) {
        Duration ttl = props.getStaffRefreshTtl();
        String token = baseBuilder(UserType.STAFF, staff.getId(), TYPE_REFRESH, ttl)
                .claim(CLAIM_TOKEN_VERSION, staff.getTokenVersion())
                .compact();
        return new IssuedToken(token, ttl.toSeconds());
    }

    /**
     * 校验签名、有效期和签发方，返回 Claims；任何异常返回 empty。
     * audience 由调用方根据请求路径判断（以便区分 401 和 403）。
     */
    public Optional<Claims> parse(String token) {
        if (!StringUtils.hasText(token)) {
            return Optional.empty();
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(props.getIssuer())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Optional.of(claims);
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /** 取 Claims 中唯一的 audience；格式不对返回 null */
    public static UserType audienceOf(Claims claims) {
        if (claims.getAudience() == null || claims.getAudience().size() != 1) {
            return null;
        }
        return UserType.fromAudience(claims.getAudience().iterator().next());
    }

    private io.jsonwebtoken.JwtBuilder baseBuilder(UserType type, Long subjectId, String tokenType, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .issuer(props.getIssuer())
                .subject(String.valueOf(subjectId))
                .audience().add(type.audience()).and()
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .claim(CLAIM_TYPE, tokenType)
                .signWith(key);
    }
}
