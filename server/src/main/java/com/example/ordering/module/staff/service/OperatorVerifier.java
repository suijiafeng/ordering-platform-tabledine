package com.example.ordering.module.staff.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.security.LoginUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 敏感操作的操作人身份复核：要求当前登录员工重新输入自己的登录密码。
 * 防止离开工位时被他人用已登录的后台直接充值等。暴力猜测由接口上的 @RateLimit 限制。
 */
@Slf4j
@Component
public class OperatorVerifier {

    private final StaffMapper staffMapper;
    private final PasswordEncoder passwordEncoder;

    public OperatorVerifier(StaffMapper staffMapper, PasswordEncoder passwordEncoder) {
        this.staffMapper = staffMapper;
        this.passwordEncoder = passwordEncoder;
    }

    /** 校验失败抛 40302；action 只用于审计日志 */
    public void verify(String password, String action) {
        LoginUser me = LoginUser.currentStaff();
        Staff staff = staffMapper.selectById(me.id());
        if (!StringUtils.hasText(password) || staff == null || !passwordEncoder.matches(password, staff.getPasswordHash())) {
            log.warn("员工 {} 执行「{}」时身份验证失败", me.id(), action);
            throw new BusinessException(ErrorCode.OPERATOR_VERIFY_FAILED);
        }
    }
}
