package com.example.ordering.security;

import com.example.ordering.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** 已认证但无权限 → 403 / 40301 */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private final JsonResponseWriter writer;

    public RestAccessDeniedHandler(JsonResponseWriter writer) {
        this.writer = writer;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        writer.write(response, ErrorCode.FORBIDDEN);
    }
}
