package com.example.ordering.module.audit.web;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记需要审计的「查看」接口（GET）：会员信息、流水、数据导出、审计日志本身等敏感数据。
 * 写操作（POST / PUT / PATCH / DELETE）不需要标注，一律审计。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AuditRead {
}
