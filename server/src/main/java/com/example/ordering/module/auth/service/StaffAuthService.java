package com.example.ordering.module.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.auth.dto.RefreshTokenRequest;
import com.example.ordering.module.auth.dto.StaffLoginRequest;
import com.example.ordering.module.auth.dto.StaffProfile;
import com.example.ordering.module.auth.dto.StaffTokenResponse;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.security.JwtService;
import com.example.ordering.security.LoginUser;
import com.example.ordering.security.UserType;
import io.jsonwebtoken.Claims;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Objects;

/**
 * 员工账号密码登录 + refresh token 续期。
 */
@Service
public class StaffAuthService {

    /** 账号不存在时也做一次 BCrypt 比对，避免通过响应时间探测账号是否存在 */
    private static final String DUMMY_HASH = "$2a$10$Sox1vJGVG7.cTUEK6Zma5.fllNqsZ8xzgfqz2uM0oZuTqtFetimAq";

    private final StaffMapper staffMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final LoginAttemptGuard attemptGuard;

    public StaffAuthService(StaffMapper staffMapper, PasswordEncoder passwordEncoder,
                            JwtService jwtService, LoginAttemptGuard attemptGuard) {
        this.staffMapper = staffMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.attemptGuard = attemptGuard;
    }

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
        return issue(staff);
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
        return new StaffTokenResponse(access.token(), access.expiresInSeconds(),
                refresh.token(), refresh.expiresInSeconds(), StaffProfile.of(staff));
    }
}
