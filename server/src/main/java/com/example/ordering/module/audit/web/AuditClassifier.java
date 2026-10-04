package com.example.ordering.module.audit.web;

import com.example.ordering.module.audit.entity.AuditOpType;

import java.lang.reflect.Method;
import java.util.List;

/**
 * 审计类别推断：显式 {@link AuditOp} 优先，其次按模块、请求方法与操作名称（接口 summary）的关键字。
 * 纯函数，便于单元测试逐个核对每个接口的分类。
 */
public final class AuditClassifier {

    private static final List<String> FUND_WORDS = List.of("充值", "退款", "支付", "拒单");
    private static final List<String> SECURITY_WORDS = List.of("密码", "启用", "停用");
    private static final List<String> STATUS_WORDS = List.of(
            "接单", "开始制作", "出餐", "送达", "上架", "下架", "沽清", "营业", "重置桌码", "撤回", "申请取消", "拒绝顾客的取消申请");
    private static final List<String> CREATE_WORDS = List.of("新建", "创建", "开户", "批量", "上传", "下单");

    private AuditClassifier() {
    }

    /**
     * @param module 控制器所在模块包名（order、member、staff、auth……）
     * @param action 操作名称（接口 summary，已去掉括号说明）
     */
    public static AuditOpType classify(Method method, String httpMethod, String module, String action) {
        AuditOp explicit = method.getAnnotation(AuditOp.class);
        if (explicit != null) {
            return explicit.value();
        }
        String a = action == null ? "" : action;
        // 改密码不管在哪个模块（员工 / 顾客自己改、店主重置）都算账号权限
        if (a.contains("密码") && !a.contains("登录")) {
            return AuditOpType.SECURITY;
        }
        if ("auth".equals(module)) {
            return AuditOpType.LOGIN;
        }
        if ("GET".equals(httpMethod)) {
            return a.contains("导出") ? AuditOpType.EXPORT : AuditOpType.VIEW;
        }
        // 先判不动钱的状态变化（拒绝取消申请、申请取消、撤回申请），再判资金
        if (containsAny(a, List.of("拒绝顾客的取消申请", "申请取消", "撤回"))) {
            return AuditOpType.STATUS;
        }
        if ("refund".equals(module) || containsAny(a, FUND_WORDS) || (a.contains("取消") && "order".equals(module))) {
            return AuditOpType.FUND;
        }
        // 员工账号的一切变更、密码、会员 / 员工启停都属于账号权限
        if ("staff".equals(module) || (("member".equals(module)) && containsAny(a, SECURITY_WORDS))
                || a.contains("密码")) {
            return AuditOpType.SECURITY;
        }
        if ("DELETE".equals(httpMethod) || a.contains("删除")) {
            return AuditOpType.DELETE;
        }
        if (containsAny(a, STATUS_WORDS) || ("table".equals(module) && containsAny(a, SECURITY_WORDS))) {
            return AuditOpType.STATUS;
        }
        if ("POST".equals(httpMethod) && containsAny(a, CREATE_WORDS)) {
            return AuditOpType.CREATE;
        }
        return AuditOpType.UPDATE;
    }

    private static boolean containsAny(String s, List<String> words) {
        return words.stream().anyMatch(s::contains);
    }
}
