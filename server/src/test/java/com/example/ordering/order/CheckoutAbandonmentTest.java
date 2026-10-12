package com.example.ordering.order;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.order.dto.AbandonCheckoutResult;
import com.example.ordering.module.order.dto.CreateOrderRequest;
import com.example.ordering.module.order.dto.OrderDetail;
import com.example.ordering.module.order.entity.CheckoutRequest;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.mapper.CheckoutRequestMapper;
import com.example.ordering.module.order.mapper.OrderMapper;
import com.example.ordering.module.order.service.CustomerOrderService;
import com.example.ordering.module.order.service.OrderStateService;
import com.example.ordering.module.order.service.OrderViewAssembler;
import com.example.ordering.module.pay.service.PayService;
import com.example.ordering.module.refund.service.RefundService;
import com.example.ordering.security.LoginUser;
import com.example.ordering.security.UserType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CheckoutAbandonmentTest {
    private final OrderMapper orders = mock(OrderMapper.class);
    private final CheckoutRequestMapper requests = mock(CheckoutRequestMapper.class);
    private final OrderViewAssembler assembler = mock(OrderViewAssembler.class);
    private final OrderStateService states = mock(OrderStateService.class);
    private final PayService payments = mock(PayService.class);
    private final RefundService refunds = mock(RefundService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final CustomerOrderService service = new CustomerOrderService(orders, null, null, null, null,
            null, null, null, states, assembler, payments, refunds, tx, null, requests);

    @BeforeEach
    void initialize() {
        authenticate(UserType.CUSTOMER);
        when(tx.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(new SimpleTransactionStatus());
        });
        when(requests.lock(11L, "original-request")).thenReturn(new CheckoutRequest());
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void abandonInitializesAndLocksCustomerKeyBeforeLookupAndPermanentTombstone() {
        AbandonCheckoutResult result = service.abandonCheckout("original-request");
        assertThat(result.abandoned()).isTrue();
        assertThat(result.order()).isNull();
        InOrder ordered = inOrder(tx, requests, orders);
        ordered.verify(tx).execute(any());
        ordered.verify(requests).ensureExists(11L, "original-request");
        ordered.verify(requests).lock(11L, "original-request");
        ordered.verify(orders).selectOne(any());
        ordered.verify(requests).abandon(11L, "original-request");
        verify(orders, never()).insert(any(Order.class));
        verifyNoInteractions(states, payments, refunds);
    }

    @Test
    void existingOrderIsReturnedWithoutAbandoningCancelingOrPaying() {
        Order existing = new Order();
        OrderDetail detail = mock(OrderDetail.class);
        when(orders.selectOne(any())).thenReturn(existing);
        when(assembler.customerDetail(existing)).thenReturn(detail);
        AbandonCheckoutResult result = service.abandonCheckout("original-request");
        assertThat(result.abandoned()).isFalse();
        assertThat(result.order()).isSameAs(detail);
        verify(requests, never()).abandon(anyLong(), anyString());
        verify(orders, never()).insert(any(Order.class));
        verifyNoInteractions(states, payments, refunds);
    }

    @Test
    void lateCreateRejectsTombstoneBeforeAnyStockOrFinancialWork() {
        CheckoutRequest abandoned = new CheckoutRequest();
        abandoned.setAbandoned(true);
        when(requests.lock(11L, "original-request")).thenReturn(abandoned);
        assertThatThrownBy(() -> service.create(request()))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
        InOrder ordered = inOrder(tx, requests, orders);
        ordered.verify(tx).execute(any());
        ordered.verify(requests).ensureExists(11L, "original-request");
        ordered.verify(requests).lock(11L, "original-request");
        ordered.verify(orders).selectOne(any());
        verify(orders, never()).insert(any(Order.class));
        verifyNoInteractions(states, payments, refunds, assembler);
    }

    @Test
    void duplicateCreateStillLocksAndReturnsLegacyOrderBeforeCheckingTombstone() {
        CheckoutRequest abandoned = new CheckoutRequest();
        abandoned.setAbandoned(true);
        when(requests.lock(11L, "original-request")).thenReturn(abandoned);
        Order existing = new Order();
        OrderDetail detail = mock(OrderDetail.class);
        when(orders.selectOne(any())).thenReturn(existing);
        when(assembler.customerDetail(existing)).thenReturn(detail);
        assertThat(service.create(request())).isSameAs(detail);
        InOrder ordered = inOrder(tx, requests, orders);
        ordered.verify(tx).execute(any());
        ordered.verify(requests).ensureExists(11L, "original-request");
        ordered.verify(requests).lock(11L, "original-request");
        ordered.verify(orders).selectOne(any());
        verify(orders, never()).insert(any(Order.class));
        verifyNoInteractions(states, payments, refunds);
    }

    @Test
    void staffCannotCreateCustomerTombstones() {
        authenticate(UserType.STAFF);
        assertThatThrownBy(() -> service.abandonCheckout("original-request"))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN));
        verifyNoInteractions(orders, requests, states, payments, refunds);
    }

    private CreateOrderRequest request() {
        return new CreateOrderRequest("original-request", "table", List.of(), 1, null);
    }

    private void authenticate(UserType type) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(type, 11L, null, null), null, List.of()));
    }
}
