package com.example.ordering.audit;

import com.example.ordering.module.audit.entity.AuditOpType;
import com.example.ordering.module.audit.web.AuditClassifier;
import com.example.ordering.module.audit.web.AuditRead;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 逐个核对所有需要审计的接口被归到哪个操作类别（不需要数据库）。
 * 新增接口时跑一遍，看输出的表格分类是否合理；关键接口在下面断言。
 */
class AuditClassifierTest {

    @Test
    void everyAuditedEndpointHasExpectedCategory() throws Exception {
        Map<String, AuditOpType> result = new LinkedHashMap<>();
        List<String> table = new ArrayList<>();
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        for (BeanDefinition bd : scanner.findCandidateComponents("com.example.ordering.module")) {
            Class<?> controller = Class.forName(bd.getBeanClassName());
            String module = moduleOf(controller);
            for (Method m : controller.getDeclaredMethods()) {
                String http = httpMethod(m);
                if (http == null || ("GET".equals(http) && !m.isAnnotationPresent(AuditRead.class))) {
                    continue;
                }
                String action = action(m);
                AuditOpType type = AuditClassifier.classify(m, http, module, action);
                result.put(controller.getSimpleName() + "#" + m.getName(), type);
                table.add(String.format("%-28s %-6s %-10s %s", controller.getSimpleName() + "#" + m.getName(), http, type.label(), action));
            }
        }
        table.sort(String::compareTo);
        table.forEach(System.out::println);

        assertThat(result).containsEntry("MerchantMemberController#recharge", AuditOpType.FUND)
                .containsEntry("MerchantMemberController#list", AuditOpType.VIEW)
                .containsEntry("MerchantMemberController#setStatus", AuditOpType.SECURITY)
                .containsEntry("MerchantRefundController#approve", AuditOpType.FUND)
                .containsEntry("MerchantOrderController#accept", AuditOpType.STATUS)
                .containsEntry("MerchantOrderController#reject", AuditOpType.FUND)
                .containsEntry("MerchantOrderController#approveCancelRequest", AuditOpType.FUND)
                .containsEntry("MerchantOrderController#rejectCancelRequest", AuditOpType.STATUS)
                .containsEntry("MerchantOrderController#start", AuditOpType.STATUS)
                .containsEntry("MerchantStaffController#create", AuditOpType.SECURITY)
                .containsEntry("MerchantReportController#export", AuditOpType.EXPORT)
                .containsEntry("CustomerOrderController#create", AuditOpType.CREATE)
                .containsEntry("CustomerOrderController#pay", AuditOpType.FUND)
                .containsEntry("CustomerOrderController#withdraw", AuditOpType.STATUS)
                .containsEntry("CustomerAuthController#changePassword", AuditOpType.SECURITY)
                .containsEntry("CustomerAuthController#passwordLogin", AuditOpType.LOGIN)
                .containsEntry("MerchantRefundController#retry", AuditOpType.FUND)
                .containsEntry("MerchantMenuController#sortCategories", AuditOpType.UPDATE)
                .containsEntry("MerchantMemberController#transactions", AuditOpType.VIEW)
                .containsEntry("MerchantAuditController#query", AuditOpType.VIEW);
    }

    private static String moduleOf(Class<?> c) {
        String pkg = c.getPackageName();
        String rest = pkg.substring(pkg.indexOf(".module.") + ".module.".length());
        return rest.contains(".") ? rest.substring(0, rest.indexOf('.')) : rest;
    }

    private static String httpMethod(Method m) {
        if (m.isAnnotationPresent(PostMapping.class)) {
            return "POST";
        }
        if (m.isAnnotationPresent(PutMapping.class)) {
            return "PUT";
        }
        if (m.isAnnotationPresent(PatchMapping.class)) {
            return "PATCH";
        }
        if (m.isAnnotationPresent(DeleteMapping.class)) {
            return "DELETE";
        }
        return m.isAnnotationPresent(GetMapping.class) ? "GET" : null;
    }

    private static String action(Method m) {
        io.swagger.v3.oas.annotations.Operation op = m.getAnnotation(io.swagger.v3.oas.annotations.Operation.class);
        String s = op != null && !op.summary().isBlank() ? op.summary() : m.getName();
        int cut = s.length();
        for (String mark : new String[]{"（", "("}) {
            int idx = s.indexOf(mark);
            if (idx > 0) {
                cut = Math.min(cut, idx);
            }
        }
        return s.substring(0, cut).trim();
    }
}
