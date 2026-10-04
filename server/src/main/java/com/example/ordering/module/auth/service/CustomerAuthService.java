package com.example.ordering.module.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.module.auth.client.MiniProgramAuthClientRegistry;
import com.example.ordering.module.auth.client.MiniProgramIdentity;
import com.example.ordering.module.auth.dto.CustomerLoginRequest;
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
 * 顾客小程序静默登录：code → openId → 查找或创建顾客 → 签发 customer JWT。
 */
@Slf4j
@Service
public class CustomerAuthService {

    private final MiniProgramAuthClientRegistry clientRegistry;
    private final CustomerMapper customerMapper;
    private final CustomerAuthMapper customerAuthMapper;
    private final JwtService jwtService;
    private final TransactionTemplate transactionTemplate;

    public CustomerAuthService(MiniProgramAuthClientRegistry clientRegistry,
                               CustomerMapper customerMapper,
                               CustomerAuthMapper customerAuthMapper,
                               JwtService jwtService,
                               TransactionTemplate transactionTemplate) {
        this.clientRegistry = clientRegistry;
        this.customerMapper = customerMapper;
        this.customerAuthMapper = customerAuthMapper;
        this.jwtService = jwtService;
        this.transactionTemplate = transactionTemplate;
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
        return new CustomerProfile(c.getId(), c.getNickname(), c.getAvatar(), user.platform());
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
