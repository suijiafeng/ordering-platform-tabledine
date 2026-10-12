package com.example.ordering.module.refund.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.module.refund.dto.CustomerRefundRequest.ItemInput;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.entity.RefundType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MerchantRefundIdentityTest {

    @Test
    void fingerprintUsesOriginalIntentAndIgnoresItemOrder() {
        var first = new MerchantRefundRequest("req-1", RefundType.ITEM, "退款", List.of(new ItemInput(1L, 2), new ItemInput(2L, 1)), null);
        var reordered = new MerchantRefundRequest("req-1", RefundType.ITEM, "退款", List.of(new ItemInput(2L, 1), new ItemInput(1L, 2)), null);
        assertThat(MerchantRefundIdentity.of(1L, first)).isEqualTo(MerchantRefundIdentity.of(1L, reordered));
        assertThat(MerchantRefundIdentity.of(1L, first).requestFingerprint()).hasSize(64);
    }

    @Test
    void everyConsequentialFieldChangesTheFingerprint() {
        var original = new MerchantRefundRequest("req-1", RefundType.CUSTOM, "补偿", null, 1000L);
        String fingerprint = MerchantRefundIdentity.of(1L, original).requestFingerprint();
        for (MerchantRefundRequest changed : List.of(
                new MerchantRefundRequest("req-1", RefundType.CUSTOM, "补偿", null, 2000L),
                new MerchantRefundRequest("req-1", RefundType.CUSTOM, "不同原因", null, 1000L),
                new MerchantRefundRequest("req-1", RefundType.FULL, "补偿", null, 1000L),
                new MerchantRefundRequest("req-1", RefundType.CUSTOM, "补偿", List.of(new ItemInput(1L, 1)), 1000L))) {
            assertThat(MerchantRefundIdentity.of(1L, changed).requestFingerprint()).isNotEqualTo(fingerprint);
        }
        assertThat(MerchantRefundIdentity.of(2L, original).requestFingerprint()).isNotEqualTo(fingerprint);
    }

    @Test
    void differentIdsCanRepresentSeparateRefundsWithIdenticalContents() {
        var first = MerchantRefundIdentity.of(1L, new MerchantRefundRequest("req-1", RefundType.CUSTOM, "补偿", null, 1000L));
        var second = MerchantRefundIdentity.of(1L, new MerchantRefundRequest("req-2", RefundType.CUSTOM, "补偿", null, 1000L));
        assertThat(first.clientRequestId()).isNotEqualTo(second.clientRequestId());
        assertThat(first.requestFingerprint()).isEqualTo(second.requestFingerprint());
    }

    @Test
    void missingAndMalformedClientIdsFailClosed() {
        for (String requestId : new String[]{null, "", " ", "x".repeat(65), "not/a/key"}) {
            assertThatThrownBy(() -> MerchantRefundIdentity.of(1L,
                    new MerchantRefundRequest(requestId, RefundType.CUSTOM, "补偿", null, 1000L)))
                    .isInstanceOf(BusinessException.class);
        }
    }
}
