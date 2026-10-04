package com.example.ordering.module.audit.entity;

/** 审计日志的操作类别（与「模块」正交，用于按性质检索，如只看资金操作） */
public enum AuditOpType {
    LOGIN("登录认证"),
    VIEW("敏感查看"),
    EXPORT("导出"),
    FUND("资金"),
    SECURITY("账号权限"),
    CREATE("新增"),
    UPDATE("修改"),
    DELETE("删除"),
    STATUS("状态流转"),
    SYSTEM("系统自动");

    private final String label;

    AuditOpType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
