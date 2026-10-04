package com.example.ordering.module.staff.service;

import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** 员工姓名查询（订单日志、退款记录展示操作人） */
@Component
public class StaffDirectory {

    private final StaffMapper staffMapper;

    public StaffDirectory(StaffMapper staffMapper) {
        this.staffMapper = staffMapper;
    }

    /** 员工 ID → 姓名。返回 HashMap（允许 get(null)：系统 / 顾客操作的 operatorId 为空） */
    public Map<Long, String> namesOf(Collection<Long> staffIds) {
        Map<Long, String> names = new HashMap<>();
        if (staffIds == null || staffIds.isEmpty()) {
            return names;
        }
        for (Staff staff : staffMapper.selectBatchIds(staffIds)) {
            names.put(staff.getId(), staff.getName());
        }
        return names;
    }
}
