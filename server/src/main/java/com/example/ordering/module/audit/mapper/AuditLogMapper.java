package com.example.ordering.module.audit.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.ordering.module.audit.entity.AuditLog;

/** 只用于插入与查询；不要在业务代码里调用 update / delete（数据库触发器也会拒绝） */
public interface AuditLogMapper extends BaseMapper<AuditLog> {
}
