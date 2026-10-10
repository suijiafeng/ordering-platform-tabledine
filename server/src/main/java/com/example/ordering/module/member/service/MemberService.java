package com.example.ordering.module.member.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.module.member.dto.MemberCreateRequest;
import com.example.ordering.module.member.dto.MemberUpdateRequest;
import com.example.ordering.module.member.dto.MemberView;
import com.example.ordering.module.member.dto.RechargeRequest;
import com.example.ordering.module.wallet.dto.WalletTransactionView;
import com.example.ordering.module.wallet.service.WalletService;
import com.example.ordering.security.LoginUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 商家端会员管理：建号、改名 / 重置密码、启用停用、充值、流水。
 * customer 表不在多租户白名单内（顾客端无门店上下文），这里所有查询显式按当前门店过滤。
 */
@Service
public class MemberService {

    private final CustomerMapper customerMapper;
    private final WalletService walletService;
    private final PasswordEncoder passwordEncoder;

    public MemberService(CustomerMapper customerMapper, WalletService walletService, PasswordEncoder passwordEncoder) {
        this.customerMapper = customerMapper;
        this.walletService = walletService;
        this.passwordEncoder = passwordEncoder;
    }

    public PageResult<MemberView> list(String keyword, int page, int pageSize) {
        LambdaQueryWrapper<Customer> w = Wrappers.<Customer>lambdaQuery()
                .eq(Customer::getStoreId, LoginUser.currentStaff().storeId())
                .isNotNull(Customer::getPhone);
        if (StringUtils.hasText(keyword)) {
            String k = keyword.trim();
            w.and(q -> q.like(Customer::getPhone, k).or().like(Customer::getNickname, k));
        }
        w.orderByDesc(Customer::getId);
        // 店员只看脱敏手机号；建号 / 改密 / 充值等返回完整号码的接口本身只对店主开放
        boolean fullPhone = LoginUser.currentStaff().isOwner();
        return PageResult.of(customerMapper.selectPage(new Page<>(page, pageSize), w), c -> MemberView.of(c, fullPhone));
    }

    /** 数据库事务：建号与可选的首次充值一起提交 */
    @Transactional
    public MemberView create(MemberCreateRequest req) {
        LoginUser staff = LoginUser.currentStaff();
        Customer c = new Customer();
        c.setStoreId(staff.storeId());
        c.setPhone(req.phone().trim());
        c.setNickname(req.name().trim());
        c.setPasswordHash(passwordEncoder.encode(req.password()));
        c.setStatus(Customer.STATUS_NORMAL);
        c.setBalance(0L);
        c.setTokenVersion(0);
        try {
            customerMapper.insert(c);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ErrorCode.CONFLICT, "该手机号已注册");
        }
        if (req.initialAmount() != null && req.initialAmount() > 0) {
            walletService.recharge(c, req.initialAmount(), staff.id(), "开户充值", null);
        }
        return MemberView.of(customerMapper.selectById(c.getId()));
    }

    public MemberView update(Long id, MemberUpdateRequest req) {
        Customer c = ownMember(id);
        var u = Wrappers.<Customer>lambdaUpdate().eq(Customer::getId, c.getId());
        boolean changed = false;
        if (StringUtils.hasText(req.name())) {
            u.set(Customer::getNickname, req.name().trim());
            changed = true;
        }
        if (StringUtils.hasText(req.password())) {
            // 重置密码：token_version 递增，该会员的旧登录立即失效
            u.set(Customer::getPasswordHash, passwordEncoder.encode(req.password()))
                    .set(Customer::getTokenVersion, (c.getTokenVersion() == null ? 0 : c.getTokenVersion()) + 1);
            changed = true;
        }
        if (changed) {
            customerMapper.update(null, u);
        }
        return MemberView.of(customerMapper.selectById(c.getId()));
    }

    /** 停用后旧 token 立即失效（JwtAuthFilter 每次请求校验状态与 token_version），重新启用后也需要重新登录 */
    public MemberView setEnabled(Long id, boolean enabled) {
        Customer c = ownMember(id);
        var update = Wrappers.<Customer>lambdaUpdate()
                .set(Customer::getStatus, enabled ? Customer.STATUS_NORMAL : Customer.STATUS_DISABLED)
                .eq(Customer::getId, c.getId());
        if (!enabled) {
            // 与员工一致：停用时 token_version 递增，之后即使重新启用，停用前签发的 token 也不再有效
            update.setSql("token_version = token_version + 1");
        }
        customerMapper.update(null, update);
        return MemberView.of(customerMapper.selectById(c.getId()));
    }

    /** 充值：仅店主（控制器限制）；数据库事务由 WalletService 承担 */
    public MemberView recharge(Long id, RechargeRequest req) {
        Customer c = ownMember(id);
        if (!c.isEnabled()) {
            throw new BusinessException(ErrorCode.CONFLICT, "会员已停用，请先启用");
        }
        walletService.recharge(c, req.amount(), LoginUser.currentStaff().id(),
                StringUtils.hasText(req.remark()) ? req.remark().trim() : null,
                StringUtils.hasText(req.requestId()) ? req.requestId().trim() : null);
        return MemberView.of(customerMapper.selectById(c.getId()));
    }

    public PageResult<WalletTransactionView> transactions(Long id, int page, int pageSize) {
        return walletService.transactions(ownMember(id).getId(), page, pageSize);
    }

    /** 只能操作本门店的会员；其他门店或非会员顾客（已停用的小程序登录留下的）一律 404，不泄露存在性 */
    private Customer ownMember(Long id) {
        Customer c = customerMapper.selectById(id);
        if (c == null || !c.isMember() || !LoginUser.currentStaff().storeId().equals(c.getStoreId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "会员不存在");
        }
        return c;
    }
}
