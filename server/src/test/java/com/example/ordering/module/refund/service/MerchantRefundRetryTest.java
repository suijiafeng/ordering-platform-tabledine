package com.example.ordering.module.refund.service;

import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.pay.channel.BalancePayChannel;
import com.example.ordering.module.refund.dto.MerchantRefundRequest;
import com.example.ordering.module.refund.dto.RefundView;
import com.example.ordering.module.refund.entity.Refund;
import com.example.ordering.module.refund.entity.RefundStatus;
import com.example.ordering.module.refund.entity.RefundType;
import com.example.ordering.module.refund.mapper.RefundItemMapper;
import com.example.ordering.module.refund.mapper.RefundMapper;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.security.LoginUser;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MerchantRefundRetryTest {

    @Test
    void completedPartialRefundRetryReturnsOriginalWithoutCreatingOrCreditingAgain() {
        var refundMapper = mock(RefundMapper.class);
        var orderMapper = mock(OrderMapper.class);
        var calculator = mock(RefundCalculator.class);
        var ledger = mock(RefundLedger.class);
        var channel = mock(BalancePayChannel.class);
        var executor = mock(Executor.class);
        var assembler = mock(RefundViewAssembler.class);
        var service = new RefundService(refundMapper, mock(RefundItemMapper.class), orderMapper,
                mock(OrderStateService.class), mock(StoreService.class), channel, mock(PlatformTransactionManager.class),
                calculator, ledger, assembler, executor);
        var request = new MerchantRefundRequest("lost-response", RefundType.CUSTOM, "补偿", null, 1000L);
        Order current = new Order();
        current.setId(1L);
        current.setStoreId(1L);
        current.setStatus(OrderStatus.DONE);
        current.setPayAmount(10000L);
        current.setRefundedAmount(1000L);
        Refund original = new Refund();
        original.setId(1L);
        original.setOrderId(1L);
        original.setRefundNo("original-refund");
        original.setClientRequestId(request.clientRequestId());
        original.setRequestFingerprint(MerchantRefundIdentity.of(1L, request).requestFingerprint());
        original.setAmount(1000L);
        original.setStatus(RefundStatus.SUCCESS);
        RefundView receipt = mock(RefundView.class);
        LoginUser owner = mock(LoginUser.class);
        when(owner.isOwner()).thenReturn(true);
        when(orderMapper.selectOne(any())).thenReturn(current);
        when(refundMapper.selectOne(any())).thenReturn(original);
        when(assembler.view(original, current)).thenReturn(receipt);

        assertThat(service.merchantInitiate(current, request, owner)).isSameAs(receipt);
        verify(refundMapper, never()).insert(any(Refund.class));
        verifyNoInteractions(calculator, ledger, channel, executor);
    }
}
