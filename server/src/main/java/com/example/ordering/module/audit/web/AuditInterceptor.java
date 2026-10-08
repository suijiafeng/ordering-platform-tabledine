package com.example.ordering.module.audit.web;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.module.audit.entity.AuditLog;
import com.example.ordering.module.audit.entity.AuditOpType;
import com.example.ordering.module.audit.service.AuditService;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.module.staff.entity.Staff;
import com.example.ordering.module.staff.mapper.StaffMapper;
import com.example.ordering.ratelimit.ClientIp;
import com.example.ordering.security.LoginUser;
import com.example.ordering.security.UserType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 操作审计拦截器：请求结束时记录「谁、何时、在哪、做了什么、对谁、结果如何」。
 * <ul>
 *   <li>所有写操作（POST / PUT / PATCH / DELETE）一律记录，包括失败的（参数错误、无权限、密码复核失败、限流）</li>
 *   <li>查看类接口只记录标了 {@link AuditRead} 的敏感数据（会员、流水、导出、审计日志本身），轮询不记</li>
 *   <li>登录记录尝试的账号（成功与失败都记）；请求参数里的密码、令牌一律打码</li>
 * </ul>
 * 未登录访问受保护接口在安全过滤器就被拦下，不会到这里（不属于「操作」）。
 */
@Component
public class AuditInterceptor implements HandlerInterceptor {

    public static final String ERROR_CODE_ATTR = "audit.errorCode";
    public static final String ERROR_MESSAGE_ATTR = "audit.errorMessage";
    private static final String START_ATTR = "audit.start";

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    /** 续期令牌是浏览器后台自动发起的，不是用户操作 */
    private static final Set<String> SKIP_PATHS = Set.of("/api/v1/m/auth/refresh", "/api/v1/c/auth/refresh");
    private static final Pattern SECRET_KEY = Pattern.compile("(?i).*(password|token|secret).*");
    /** 手机号类字段：脱敏后再记录（审计日志里同样不留完整号码） */
    private static final Pattern PHONE_KEY = Pattern.compile("(?i).*phone.*");
    private static final int MAX_DETAIL = 2000;

    private static final Map<String, String> CATEGORY = Map.ofEntries(
            Map.entry("order", "订单"), Map.entry("refund", "退款"), Map.entry("member", "会员"),
            Map.entry("menu", "菜品"), Map.entry("table", "桌台"), Map.entry("staff", "员工"),
            Map.entry("store", "店铺设置"), Map.entry("report", "数据"), Map.entry("file", "文件"),
            Map.entry("auth", "登录"), Map.entry("customer", "顾客"), Map.entry("pay", "支付"),
            Map.entry("wallet", "余额"), Map.entry("audit", "审计"));

    private final AuditService auditService;
    private final StaffMapper staffMapper;
    private final CustomerMapper customerMapper;
    private final ObjectMapper objectMapper;

    public AuditInterceptor(AuditService auditService, StaffMapper staffMapper, CustomerMapper customerMapper, ObjectMapper objectMapper) {
        this.auditService = auditService;
        this.staffMapper = staffMapper;
        this.customerMapper = customerMapper;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_ATTR, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        if (!(handler instanceof HandlerMethod hm) || !shouldAudit(request, hm)) {
            return;
        }
        AuditLog entry = new AuditLog();
        fillActor(entry, request);
        String module = module(hm);
        entry.setCategory(CATEGORY.getOrDefault(module, module));
        entry.setAction(action(hm));
        AuditOpType opType = AuditClassifier.classify(hm.getMethod(), request.getMethod(), module, entry.getAction());
        JsonNode body = bodyJson(request);
        if (opType == AuditOpType.CREATE && body != null && body.path("initialAmount").asLong(0) > 0) {
            // 开户时顺带充值：按资金操作归类，检索资金流水时不会漏掉
            opType = AuditOpType.FUND;
        }
        entry.setOpType(opType.name());
        entry.setTarget(target(request));
        entry.setHttpMethod(request.getMethod());
        entry.setPath(truncate(request.getRequestURI(), 255));
        entry.setDetail(detail(request));
        Object code = request.getAttribute(ERROR_CODE_ATTR);
        entry.setSuccess(ex == null && response.getStatus() < 400 && code == null);
        if (!entry.getSuccess()) {
            entry.setErrorCode(code instanceof Integer i ? i : response.getStatus());
            Object msg = request.getAttribute(ERROR_MESSAGE_ATTR);
            entry.setErrorMessage(truncate(msg != null ? msg.toString() : ex != null ? ex.getClass().getSimpleName() : null, 255));
        }
        entry.setIp(truncate(ClientIp.of(request), 64));
        entry.setUserAgent(truncate(request.getHeader("User-Agent"), 255));
        Object start = request.getAttribute(START_ATTR);
        if (start instanceof Long s) {
            entry.setDurationMs((int) Math.min(Integer.MAX_VALUE, System.currentTimeMillis() - s));
        }
        auditService.record(entry);
    }

    private static boolean shouldAudit(HttpServletRequest request, HandlerMethod hm) {
        if (!request.getRequestURI().startsWith("/api/") || SKIP_PATHS.contains(request.getRequestURI())) {
            return false;
        }
        return WRITE_METHODS.contains(request.getMethod()) || hm.hasMethodAnnotation(AuditRead.class);
    }

    /** 操作人：已登录取登录身份；登录接口取填写的账号（找得到账号就归到对应门店，店主能查到本店的登录失败） */
    private void fillActor(AuditLog entry, HttpServletRequest request) {
        LoginUser user = LoginUser.currentOrNull();
        if (user != null && user.type() == UserType.STAFF) {
            Staff s = staffMapper.selectById(user.id());
            entry.setActorType(AuditLog.ACTOR_STAFF);
            entry.setActorId(user.id());
            entry.setActorRole(user.role());
            entry.setStoreId(user.storeId());
            entry.setActorName(s != null ? s.getName() : null);
            return;
        }
        if (user != null && user.type() == UserType.CUSTOMER) {
            Customer c = customerMapper.selectById(user.id());
            entry.setActorType(AuditLog.ACTOR_CUSTOMER);
            entry.setActorId(user.id());
            entry.setStoreId(c != null ? c.getStoreId() : null);
            entry.setActorName(c != null ? customerName(c) : null);
            return;
        }
        entry.setActorType(AuditLog.ACTOR_ANONYMOUS);
        JsonNode body = bodyJson(request);
        if (body == null) {
            return;
        }
        if (body.hasNonNull("username")) {
            String username = body.get("username").asText();
            entry.setActorName(truncate(username, 64));
            Staff s = staffMapper.selectOne(Wrappers.<Staff>lambdaQuery().eq(Staff::getUsername, username.trim()).last("LIMIT 1"));
            if (s != null) {
                entry.setActorType(AuditLog.ACTOR_STAFF);
                entry.setActorId(s.getId());
                entry.setActorRole(s.getRole());
                entry.setStoreId(s.getStoreId());
                entry.setActorName(s.getName() + "（" + s.getUsername() + "）");
            }
        } else if (body.hasNonNull("phone")) {
            String phone = body.get("phone").asText();
            entry.setActorName(maskPhone(phone));
            List<Customer> found = customerMapper.selectList(Wrappers.<Customer>lambdaQuery().eq(Customer::getPhone, phone.trim()).last("LIMIT 1"));
            if (!found.isEmpty()) {
                Customer c = found.get(0);
                entry.setActorType(AuditLog.ACTOR_CUSTOMER);
                entry.setActorId(c.getId());
                entry.setStoreId(c.getStoreId());
                entry.setActorName(customerName(c));
            }
        }
    }

    private static String customerName(Customer c) {
        String phone = maskPhone(c.getPhone());
        return c.getNickname() != null ? c.getNickname() + (phone != null ? "（" + phone + "）" : "") : phone;
    }

    /** 模块包名：取控制器所在的 module 包，如 module.order.controller → order（中文名见 CATEGORY） */
    static String module(HandlerMethod hm) {
        return moduleOf(hm.getBeanType());
    }

    static String moduleOf(Class<?> controller) {
        String pkg = controller.getPackageName();
        int i = pkg.indexOf(".module.");
        if (i >= 0) {
            String rest = pkg.substring(i + ".module.".length());
            return rest.contains(".") ? rest.substring(0, rest.indexOf('.')) : rest;
        }
        return "其他";
    }

    /** 操作名称：复用接口文档的 summary，去掉括号里的补充说明 */
    private static String action(HandlerMethod hm) {
        return actionOf(hm.getMethod());
    }

    static String actionOf(java.lang.reflect.Method method) {
        Operation op = method.getAnnotation(Operation.class);
        String summary = op != null && !op.summary().isBlank() ? op.summary() : method.getName();
        int cut = summary.length();
        for (String mark : new String[]{"（", "("}) {
            int idx = summary.indexOf(mark);
            if (idx > 0) {
                cut = Math.min(cut, idx);
            }
        }
        return truncate(summary.substring(0, cut).trim(), 128);
    }

    /** 操作对象：路径参数，如 orderNo=2026…、id=12 */
    @SuppressWarnings("unchecked")
    private static String target(HttpServletRequest request) {
        Object vars = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (vars instanceof Map<?, ?> m && !m.isEmpty()) {
            return truncate(((Map<String, String>) m).entrySet().stream()
                    .map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(", ")), 255);
        }
        return null;
    }

    /** 请求参数：请求体（JSON）+ 查询参数，密码 / 令牌类字段打码，超长截断 */
    private String detail(HttpServletRequest request) {
        ObjectNode out = objectMapper.createObjectNode();
        JsonNode body = bodyJson(request);
        if (body != null) {
            out.set("body", body);
        }
        if (!request.getParameterMap().isEmpty()) {
            ObjectNode query = out.putObject("query");
            request.getParameterMap().forEach((k, v) -> query.put(k, SECRET_KEY.matcher(k).matches() ? "***"
                    : String.join(",", v).matches("1\\d{10}") ? maskPhone(String.join(",", v)) : String.join(",", v)));
        }
        return out.isEmpty() ? null : truncate(out.toString(), MAX_DETAIL);
    }

    /** 已脱敏的请求体 JSON；不是 JSON 请求（如文件上传）时返回 null */
    private JsonNode bodyJson(HttpServletRequest request) {
        Object body = request.getAttribute(AuditBodyAdvice.BODY_ATTR);
        if (body == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.valueToTree(body);
            redact(node);
            return node;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static void redact(JsonNode node) {
        if (node instanceof ObjectNode obj) {
            Iterator<Map.Entry<String, JsonNode>> it = obj.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (SECRET_KEY.matcher(e.getKey()).matches() && !e.getValue().isNull()) {
                    e.setValue(obj.textNode("***"));
                } else if (PHONE_KEY.matcher(e.getKey()).matches() && e.getValue().isTextual()) {
                    e.setValue(obj.textNode(maskPhone(e.getValue().asText())));
                } else {
                    redact(e.getValue());
                }
            }
        } else if (node != null && node.isArray()) {
            node.forEach(AuditInterceptor::redact);
        }
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone;
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
