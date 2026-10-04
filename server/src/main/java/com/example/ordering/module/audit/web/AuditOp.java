package com.example.ordering.module.audit.web;

import com.example.ordering.module.audit.entity.AuditOpType;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 显式指定接口的审计类别；不标注时由 {@link AuditClassifier} 按模块、请求方法与操作名称推断 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AuditOp {
    AuditOpType value();
}
