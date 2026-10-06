package com.example.ordering.security;

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
 *   <li>会员：audience = customer，仅 access token；携带 token_version，重置 / 修改密码后旧 token 失效</li>
 *   <li>员工：audience = merchant，access + refresh；携带 token_version，停用 / 改密后旧 token 失效</li>
 * </ul>
 */
@Service
public class JwtService {

    public static final String CLAIM_TYPE = "typ";
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

    /**
     * 签发结果
     *
     * @param tokenId JWT jti；refresh token 用它做轮换记录（见 StaffAuthService）
     */
    public record IssuedToken(String token, long expiresInSeconds, String tokenId, Instant expiresAt) {
    }

    /**
     * 会员 token（audience = customer）。
     * @param tokenVersion 会员的 token_version：重置 / 修改密码后递增，旧 token 失效
     */
    public IssuedToken issueCustomerToken(Long customerId, int tokenVersion) {
        Duration ttl = props.getMemberTtl();
        return issue(baseBuilder(UserType.CUSTOMER, customerId, TYPE_ACCESS, ttl)
                .claim(CLAIM_TOKEN_VERSION, tokenVersion), ttl);
    }

    public IssuedToken issueStaffAccessToken(Staff staff) {
        Duration ttl = props.getStaffAccessTtl();
        return issue(baseBuilder(UserType.STAFF, staff.getId(), TYPE_ACCESS, ttl)
                .claim(CLAIM_STORE, staff.getStoreId())
                .claim(CLAIM_ROLE, staff.getRole())
                .claim(CLAIM_TOKEN_VERSION, staff.getTokenVersion()), ttl);
    }

    public IssuedToken issueStaffRefreshToken(Staff staff) {
        Duration ttl = props.getStaffRefreshTtl();
        return issue(baseBuilder(UserType.STAFF, staff.getId(), TYPE_REFRESH, ttl)
                .claim(CLAIM_TOKEN_VERSION, staff.getTokenVersion()), ttl);
    }

    private static IssuedToken issue(Builder builder, Duration ttl) {
        return new IssuedToken(builder.jwts.compact(), ttl.toSeconds(), builder.id, builder.expiresAt);
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

    /** 构建中的 token 连同它的 jti 与过期时间，签发后一起返回给调用方 */
    private static final class Builder {
        final io.jsonwebtoken.JwtBuilder jwts;
        final String id;
        final Instant expiresAt;

        Builder(io.jsonwebtoken.JwtBuilder jwts, String id, Instant expiresAt) {
            this.jwts = jwts;
            this.id = id;
            this.expiresAt = expiresAt;
        }

        Builder claim(String name, Object value) {
            jwts.claim(name, value);
            return this;
        }
    }

    private Builder baseBuilder(UserType type, Long subjectId, String tokenType, Duration ttl) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(ttl);
        String id = UUID.randomUUID().toString();
        io.jsonwebtoken.JwtBuilder jwts = Jwts.builder()
                .id(id)
                .issuer(props.getIssuer())
                .subject(String.valueOf(subjectId))
                .audience().add(type.audience()).and()
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim(CLAIM_TYPE, tokenType)
                .signWith(key);
        return new Builder(jwts, id, expiresAt);
    }
}
