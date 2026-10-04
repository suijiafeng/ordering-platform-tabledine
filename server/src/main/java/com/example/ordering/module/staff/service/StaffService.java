package com.example.ordering.module.staff.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.staff.dto.ChangePasswordRequest;
import com.example.ordering.module.staff.dto.StaffCreateRequest;
import com.example.ordering.module.staff.dto.StaffUpdateRequest;
import com.example.ordering.module.staff.dto.StaffView;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.security.LoginUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 员工管理（店主）。staff 表在多租户表内，查询自动限定当前门店。
 * 停用 / 重置密码 / 修改密码都会递增 token_version，使该员工已签发的 token 立即失效（需求 US-5 AC3）。
 */
@Service
public class StaffService {

    private final StaffMapper staffMapper;
    private final PasswordEncoder passwordEncoder;

    public StaffService(StaffMapper staffMapper, PasswordEncoder passwordEncoder) {
        this.staffMapper = staffMapper;
        this.passwordEncoder = passwordEncoder;
    }

    public List<StaffView> list() {
        return staffMapper.selectList(Wrappers.<Staff>lambdaQuery().orderByAsc(Staff::getRole).orderByAsc(Staff::getId))
                .stream().map(StaffView::of).toList();
    }

    public StaffView create(StaffCreateRequest req) {
        Staff s = new Staff();
        s.setStoreId(LoginUser.currentStaff().storeId());
        s.setUsername(req.username().trim());
        s.setName(req.name().trim());
        s.setPasswordHash(passwordEncoder.encode(req.password()));
        s.setRole(Staff.ROLE_STAFF);
        s.setStatus(Staff.STATUS_ENABLED);
        s.setTokenVersion(0);
        try {
            staffMapper.insert(s);
        } catch (DuplicateKeyException e) {
            // uk_staff_username 为全局唯一：账号是登录标识，不能跨门店重复
            throw new BusinessException(ErrorCode.CONFLICT, "该账号已被使用");
        }
        return StaffView.of(s);
    }

    public StaffView update(Long id, StaffUpdateRequest req) {
        Staff s = getRequired(id);
        s.setName(req.name().trim());
        if (StringUtils.hasText(req.password())) {
            if (s.getRole().equals(Staff.ROLE_OWNER) && !s.getId().equals(LoginUser.currentStaff().id())) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "不能重置其他店主的密码");
            }
            s.setPasswordHash(passwordEncoder.encode(req.password()));
            s.setTokenVersion(s.getTokenVersion() + 1);
        }
        s.setUpdatedAt(OffsetDateTime.now());
        staffMapper.updateById(s);
        return StaffView.of(s);
    }

    public StaffView setEnabled(Long id, boolean enabled) {
        Staff s = getRequired(id);
        LoginUser me = LoginUser.currentStaff();
        if (s.getId().equals(me.id())) {
            throw new BusinessException(ErrorCode.CONFLICT, "不能停用自己的账号");
        }
        if (Staff.ROLE_OWNER.equals(s.getRole())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "不能停用店主账号");
        }
        if (s.isEnabled() == enabled) {
            return StaffView.of(s);
        }
        s.setStatus(enabled ? Staff.STATUS_ENABLED : Staff.STATUS_DISABLED);
        if (!enabled) {
            s.setTokenVersion(s.getTokenVersion() + 1);
        }
        s.setUpdatedAt(OffsetDateTime.now());
        staffMapper.updateById(s);
        return StaffView.of(s);
    }

    /** 当前登录员工修改自己的密码；成功后旧 token 失效，需重新登录 */
    public void changeOwnPassword(ChangePasswordRequest req) {
        Staff s = getRequired(LoginUser.currentStaff().id());
        if (!passwordEncoder.matches(req.oldPassword(), s.getPasswordHash())) {
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS, "当前密码不正确");
        }
        if (req.oldPassword().equals(req.newPassword())) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "新密码不能与当前密码相同");
        }
        s.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        s.setTokenVersion(s.getTokenVersion() + 1);
        s.setUpdatedAt(OffsetDateTime.now());
        staffMapper.updateById(s);
    }

    private Staff getRequired(Long id) {
        Staff s = staffMapper.selectById(id);
        if (s == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "员工不存在");
        }
        return s;
    }
}
