package com.example.ordering.module.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.module.auth.client.MiniProgramAuthClientRegistry;
import com.example.ordering.module.auth.client.MiniProgramIdentity;
import com.example.ordering.module.auth.dto.CustomerChangePasswordRequest;
import com.example.ordering.module.auth.dto.CustomerLoginRequest;
import com.example.ordering.module.auth.dto.PasswordLoginRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.example.ordering.module.auth.dto.CustomerLoginResponse;
import com.example.ordering.module.auth.dto.CustomerProfile;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.entity.CustomerAuth;
import com.example.ordering.module.customer.mapper.CustomerAuthMapper;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.security.JwtService;
import com.example.ordering.security.LoginUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 顾客登录：
 * <ul>
 *   <li>小程序静默登录：code → openId → 查找或创建顾客 → 签发 customer JWT</li>
 *   <li>会员密码登录（H5）：手机号 + 密码，账号由商家后台创建；连续失败锁定与员工登录同一策略；
 *       token 携带 token_version，重置密码后旧 token 失效</li>
 * </ul>
 */
@Slf4j
@Service
public class CustomerAuthService {

    private final MiniProgramAuthClientRegistry clientRegistry;
    private final CustomerMapper customerMapper;
    private final CustomerAuthMapper customerAuthMapper;
    private final JwtService jwtService;
    private final TransactionTemplate transactionTemplate;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptGuard attemptGuard;

    public CustomerAuthService(MiniProgramAuthClientRegistry clientRegistry,
                               CustomerMapper customerMapper,
                               CustomerAuthMapper customerAuthMapper,
                               JwtService jwtService,
                               TransactionTemplate transactionTemplate,
                               PasswordEncoder passwordEncoder,
                               LoginAttemptGuard attemptGuard) {
        this.clientRegistry = clientRegistry;
        this.customerMapper = customerMapper;
        this.customerAuthMapper = customerAuthMapper;
        this.jwtService = jwtService;
        this.transactionTemplate = transactionTemplate;
        this.passwordEncoder = passwordEncoder;
        this.attemptGuard = attemptGuard;
    }

    /** 会员密码登录（H5）。失败一律返回 40102，不区分「账号不存在」与「密码错误」 */
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
        JwtService.IssuedToken token = jwtService.issueCustomerToken(customer.getId(), Platform.H5, customer.getTokenVersion());
        return new CustomerLoginResponse(token.token(), token.expiresInSeconds(), customer.getId(), Platform.H5);
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

    public CustomerLoginResponse login(CustomerLoginRequest req) {
        MiniProgramIdentity identity = clientRegistry.get(req.platform()).exchange(req.code());
        Long customerId = findOrCreate(req.platform(), identity);

        Customer customer = customerMapper.selectById(customerId);
        if (customer == null || customer.getStatus() == null || customer.getStatus() != Customer.STATUS_NORMAL) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        JwtService.IssuedToken token = jwtService.issueCustomerToken(customerId, req.platform());
        return new CustomerLoginResponse(token.token(), token.expiresInSeconds(), customerId, req.platform());
    }

    public CustomerProfile currentProfile() {
        LoginUser user = LoginUser.currentCustomer();
        Customer c = customerMapper.selectById(user.id());
        if (c == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return new CustomerProfile(c.getId(), c.getNickname(), c.getAvatar(), user.platform(),
                c.isMember(), c.isMember() ? c.getPhone() : null, c.getBalance() == null ? 0 : c.getBalance());
    }

    private Long findOrCreate(Platform platform, MiniProgramIdentity identity) {
        CustomerAuth existing = findAuth(platform, identity.openId());
        if (existing != null) {
            return existing.getCustomerId();
        }
        try {
            return transactionTemplate.execute(status -> {
                Customer customer = new Customer();
                customer.setStatus(Customer.STATUS_NORMAL);
                customerMapper.insert(customer);

                CustomerAuth auth = new CustomerAuth();
                auth.setCustomerId(customer.getId());
                auth.setPlatform(platform);
                auth.setOpenId(identity.openId());
                auth.setUnionId(identity.unionId());
                customerAuthMapper.insert(auth);
                return customer.getId();
            });
        } catch (DuplicateKeyException e) {
            // 同一用户并发首次登录：另一请求已创建，事务已回滚，重新查询即可
            CustomerAuth created = findAuth(platform, identity.openId());
            if (created == null) {
                throw e;
            }
            return created.getCustomerId();
        }
    }

    private CustomerAuth findAuth(Platform platform, String openId) {
        return customerAuthMapper.selectOne(Wrappers.<CustomerAuth>lambdaQuery()
                .eq(CustomerAuth::getPlatform, platform)
                .eq(CustomerAuth::getOpenId, openId));
    }
}
