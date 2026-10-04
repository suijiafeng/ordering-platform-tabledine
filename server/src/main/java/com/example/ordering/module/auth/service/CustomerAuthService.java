package com.example.ordering.module.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.auth.dto.CustomerChangePasswordRequest;
import com.example.ordering.module.auth.dto.PasswordLoginRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.example.ordering.module.auth.dto.CustomerLoginResponse;
import com.example.ordering.module.auth.dto.CustomerProfile;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.security.JwtService;
import com.example.ordering.security.LoginUser;
import org.springframework.stereotype.Service;

/**
 * 会员登录：手机号 + 密码，账号由商家后台创建；连续失败锁定与员工登录同一策略；
 * token 携带 token_version，重置 / 修改密码后旧 token 失效。
 */
@Service
public class CustomerAuthService {

    private final CustomerMapper customerMapper;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptGuard attemptGuard;

    public CustomerAuthService(CustomerMapper customerMapper,
                               JwtService jwtService,
                               PasswordEncoder passwordEncoder,
                               LoginAttemptGuard attemptGuard) {
        this.customerMapper = customerMapper;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.attemptGuard = attemptGuard;
    }

    /** 会员密码登录。失败一律返回 40102，不区分「账号不存在」与「密码错误」 */
    public CustomerLoginResponse passwordLogin(PasswordLoginRequest req, String clientIp) {
        String phone = req.phone().trim();
        if (attemptGuard.isLocked(phone, clientIp)) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "失败次数过多，请稍后再试");
        }
        Customer customer = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getPhone, phone).last("LIMIT 1"));
        if (customer == null || !customer.isMember() || !passwordEncoder.matches(req.password(), customer.getPasswordHash())) {
            attemptGuard.onFailure(phone, clientIp);
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }
        if (!customer.isEnabled()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        attemptGuard.onSuccess(phone, clientIp);
        JwtService.IssuedToken token = jwtService.issueCustomerToken(customer.getId(), customer.getTokenVersion());
        return new CustomerLoginResponse(token.token(), token.expiresInSeconds(), customer.getId());
    }

    /** 会员修改自己的密码：成功后 token_version 递增，所有旧 token 失效，需重新登录 */
    public void changeOwnPassword(CustomerChangePasswordRequest req) {
        LoginUser user = LoginUser.currentCustomer();
        Customer customer = customerMapper.selectById(user.id());
        if (customer == null || !customer.isMember()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "当前账号不支持修改密码");
        }
        if (!passwordEncoder.matches(req.oldPassword(), customer.getPasswordHash())) {
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS, "原密码不正确");
        }
        customerMapper.update(null, Wrappers.<Customer>lambdaUpdate()
                .set(Customer::getPasswordHash, passwordEncoder.encode(req.newPassword()))
                .set(Customer::getTokenVersion, customer.getTokenVersion() + 1)
                .eq(Customer::getId, customer.getId()));
    }

    public CustomerProfile currentProfile() {
        LoginUser user = LoginUser.currentCustomer();
        Customer c = customerMapper.selectById(user.id());
        if (c == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return new CustomerProfile(c.getId(), c.getNickname(), c.isMember(), c.getPhone(), c.getBalance() == null ? 0 : c.getBalance());
    }
}
