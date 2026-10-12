package com.example.ordering.module.refund.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.refund.dto.CustomerRefundRequest;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

/** 商家退款的不可变请求身份；仅由原始输入生成，不依赖可退余额、菜品份数或退款状态。 */
record MerchantRefundIdentity(String clientRequestId, String requestFingerprint) {

    static MerchantRefundIdentity of(Long orderId, MerchantRefundRequest request) {
        // 服务层也失败关闭：内部调用或旧客户端不得退化为无身份的部分退款。
        if (request.clientRequestId() == null || !request.clientRequestId().matches("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少有效退款请求编号，请刷新页面后重试");
        }
        // 长度前缀隔离用户输入中的分隔符；按菜品 ID / 数量排序，等价的行顺序不影响重试。
        String reason = request.reason();
        StringBuilder canonical = new StringBuilder()
                .append(orderId).append('|').append(request.type()).append('|')
                .append(reason.length()).append(':').append(reason).append('|').append(request.amount()).append('|');
        List<CustomerRefundRequest.ItemInput> items = request.items() == null ? List.of() : request.items();
        items.stream().sorted(Comparator.comparing(CustomerRefundRequest.ItemInput::orderItemId)
                        .thenComparing(CustomerRefundRequest.ItemInput::quantity))
                .forEach(item -> canonical.append(item.orderItemId()).append(':').append(item.quantity()).append(';'));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            return new MerchantRefundIdentity(request.clientRequestId(), HexFormat.of().formatHex(digest));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
