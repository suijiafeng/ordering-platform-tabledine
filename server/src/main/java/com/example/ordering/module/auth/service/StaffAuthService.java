package com.example.ordering.module.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.auth.dto.RefreshTokenRequest;
import com.example.ordering.module.auth.dto.StaffLoginRequest;
import com.example.ordering.module.auth.dto.StaffProfile;
import com.example.ordering.module.auth.dto.StaffTokenResponse;
import com.example.ordering.module.auth.entity.StaffRefreshToken;
import com.example.ordering.module.auth.mapper.StaffRefreshTokenMapper;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.security.JwtService;
import com.example.ordering.security.LoginUser;
import com.example.ordering.security.UserType;
import io.jsonwebtoken.Claims;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * 员工账号密码登录 + refresh token 续期。
 * <p>
 * refresh token 轮换：每个有效的 refresh token 在 staff_refresh_token 表有一行（按 jti）。
 * 刷新时在同一事务里删掉旧行、插入新行，旧 token 再拿来刷新会被拒绝（401）——泄露的 refresh token
 * 最多只能用一次，且一旦被合法持有者先用掉就作废。多台设备各自登录各有一行，互不影响。
 * 停用 / 改密仍由 staff.token_version 让所有 token（含 refresh）失效，并顺带清掉该员工的全部记录。
 */
@Service
public class StaffAuthService {

    /** 账号不存在时也做一次 BCrypt 比对，避免通过响应时间探测账号是否存在 */
    private static final String DUMMY_HASH = "$2a$10$Sox1vJGVG7.cTUEK6Zma5.fllNqsZ8xzgfqz2uM0oZuTqtFetimAq";

    private final StaffMapper staffMapper;
    private final StaffRefreshTokenMapper refreshTokenMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final LoginAttemptGuard attemptGuard;

    public StaffAuthService(StaffMapper staffMapper, StaffRefreshTokenMapper refreshTokenMapper,
                            PasswordEncoder passwordEncoder, JwtService jwtService, LoginAttemptGuard attemptGuard) {
        this.staffMapper = staffMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.attemptGuard = attemptGuard;
    }

    /** 事务：数据库事务（登录成功写入 refresh token 记录） */
    @Transactional
    public StaffTokenResponse login(StaffLoginRequest req, String clientIp) {
        String username = req.username().trim();
        if (attemptGuard.isLocked(username, clientIp)) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "登录失败次数过多，请稍后再试");
        }
        Staff staff = staffMapper.selectOne(Wrappers.<Staff>lambdaQuery().eq(Staff::getUsername, username));
        boolean matched = passwordEncoder.matches(req.password(), staff != null ? staff.getPasswordHash() : DUMMY_HASH);
        if (staff == null || !matched) {
            attemptGuard.onFailure(username, clientIp);
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }
        if (!staff.isEnabled()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        attemptGuard.onSuccess(username, clientIp);
        return issue(staff);
    }

    /**
     * 刷新：校验签名 / 类型 / token_version 后，删除旧 refresh token 记录再签发新的一对。
     * 删除影响 0 行 = 该 token 已被用过（或从未由本系统签发），拒绝。
     * <p>事务：数据库事务；并发用同一个 refresh token 刷新时只有先删成功的那次拿到新 token
     */
    @Transactional
    public StaffTokenResponse refresh(RefreshTokenRequest req) {
        Claims claims = jwtService.parse(req.refreshToken())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (JwtService.audienceOf(claims) != UserType.STAFF
                || !JwtService.TYPE_REFRESH.equals(claims.get(JwtService.CLAIM_TYPE, String.class))) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        Staff staff = staffMapper.selectById(Long.valueOf(claims.getSubject()));
        Integer tv = claims.get(JwtService.CLAIM_TOKEN_VERSION, Integer.class);
        if (staff == null || !staff.isEnabled() || !Objects.equals(staff.getTokenVersion(), tv)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        int consumed = claims.getId() == null ? 0 : refreshTokenMapper.delete(Wrappers.<StaffRefreshToken>lambdaQuery()
                .eq(StaffRefreshToken::getId, claims.getId())
                .eq(StaffRefreshToken::getStaffId, staff.getId()));
        if (consumed == 0) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "登录已失效，请重新登录");
        }
        return issue(staff);
    }

    /** 停用 / 重置密码 / 改密时调用：该员工所有 refresh token 记录作废（token_version 已让它们无法通过校验，这里只是清理） */
    public void revokeRefreshTokens(Long staffId) {
        refreshTokenMapper.delete(Wrappers.<StaffRefreshToken>lambdaQuery().eq(StaffRefreshToken::getStaffId, staffId));
    }

    /** 每小时清理已过期的 refresh token 记录 */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 600_000)
    public void evictExpiredRefreshTokens() {
        refreshTokenMapper.delete(Wrappers.<StaffRefreshToken>lambdaQuery()
                .lt(StaffRefreshToken::getExpiresAt, OffsetDateTime.now()));
    }

    public StaffProfile currentProfile() {
        LoginUser user = LoginUser.currentStaff();
        Staff staff = staffMapper.selectById(user.id());
        if (staff == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return StaffProfile.of(staff);
    }

    private StaffTokenResponse issue(Staff staff) {
        JwtService.IssuedToken access = jwtService.issueStaffAccessToken(staff);
        JwtService.IssuedToken refresh = jwtService.issueStaffRefreshToken(staff);
        StaffRefreshToken record = new StaffRefreshToken();
        record.setId(refresh.tokenId());
        record.setStaffId(staff.getId());
        record.setExpiresAt(refresh.expiresAt().atOffset(ZoneOffset.UTC));
        record.setCreatedAt(OffsetDateTime.now());
        refreshTokenMapper.insert(record);
        return new StaffTokenResponse(access.token(), access.expiresInSeconds(),
                refresh.token(), refresh.expiresInSeconds(), StaffProfile.of(staff));
    }
}
