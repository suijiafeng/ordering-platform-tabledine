package com.example.ordering.module.audit.web;

import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import java.lang.reflect.Type;

/** 把反序列化后的请求体暂存到请求属性里，供审计拦截器在请求结束时记录（脱敏在拦截器里做） */
@ControllerAdvice
public class AuditBodyAdvice extends RequestBodyAdviceAdapter {

    public static final String BODY_ATTR = "audit.body";

    @Override
    public boolean supports(MethodParameter methodParameter, Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter, Type targetType,
                                Class<? extends HttpMessageConverter<?>> converterType) {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            attrs.setAttribute(BODY_ATTR, body, RequestAttributes.SCOPE_REQUEST);
        }
        return body;
    }
}
