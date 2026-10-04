package com.example.ordering.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 统一错误码（与需求文档 v1.2 §11.1 对齐，并补充登录相关细分码）。
 * <p>
 * 响应体中的 code 用于前端业务判断；HTTP 状态码同时按语义设置，方便网关和监控统计。
 */
@Getter
public enum ErrorCode {

    SUCCESS(0, "成功", HttpStatus.OK),

    UNAUTHORIZED(40101, "未登录或登录已失效", HttpStatus.UNAUTHORIZED),
    BAD_CREDENTIALS(40102, "账号或密码错误", HttpStatus.UNAUTHORIZED),
    ACCOUNT_DISABLED(40103, "账号已停用或暂时锁定", HttpStatus.UNAUTHORIZED),
    MINIAPP_LOGIN_FAILED(40104, "小程序登录失败，请重试", HttpStatus.UNAUTHORIZED),

    FORBIDDEN(40301, "无权限", HttpStatus.FORBIDDEN),

    NOT_FOUND(40401, "资源不存在", HttpStatus.NOT_FOUND),
    QR_INVALID(40402, "桌码已失效，请联系店员", HttpStatus.NOT_FOUND),

    CONFLICT(40901, "状态冲突", HttpStatus.CONFLICT),
    REFUND_IN_PROGRESS(40902, "该订单已有退款在处理中", HttpStatus.CONFLICT),

    METHOD_NOT_ALLOWED(40501, "请求方法不支持", HttpStatus.METHOD_NOT_ALLOWED),
    UNSUPPORTED_MEDIA_TYPE(41501, "不支持的请求格式", HttpStatus.UNSUPPORTED_MEDIA_TYPE),

    PARAM_INVALID(42201, "参数不合法", HttpStatus.UNPROCESSABLE_ENTITY),
    REFUND_AMOUNT_EXCEEDED(42202, "退款金额超过可退余额", HttpStatus.UNPROCESSABLE_ENTITY),
    BALANCE_INSUFFICIENT(42203, "账户余额不足，请联系店员充值", HttpStatus.UNPROCESSABLE_ENTITY),

    TOO_MANY_REQUESTS(42901, "请求过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS),

    INTERNAL_ERROR(50000, "系统繁忙，请稍后再试", HttpStatus.INTERNAL_SERVER_ERROR),
    PAY_CHANNEL_ERROR(50001, "支付渠道调用失败", HttpStatus.BAD_GATEWAY),
    REFUND_CHANNEL_ERROR(50002, "退款渠道调用失败", HttpStatus.BAD_GATEWAY),

    SOLD_OUT(60001, "菜品已售罄", HttpStatus.CONFLICT),
    STORE_CLOSED(60002, "店铺已打烊", HttpStatus.CONFLICT);

    private final int code;
    private final String message;
    private final HttpStatus httpStatus;

    ErrorCode(int code, String message, HttpStatus httpStatus) {
        this.code = code;
        this.message = message;
        this.httpStatus = httpStatus;
    }
}
