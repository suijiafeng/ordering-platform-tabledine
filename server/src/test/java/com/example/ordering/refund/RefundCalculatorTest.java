package com.example.ordering.refund;

import com.example.ordering.common.BusinessException;
import com.example.ordering.module.order.entity.Order;
import com.example.ordering.module.order.entity.OrderItem;
import com.example.ordering.module.order.entity.OrderStatus;
import com.example.ordering.module.refund.dto.CustomerRefundRequest.ItemInput;
import com.example.ordering.module.refund.entity.RefundItem;
import com.example.ordering.module.refund.service.RefundCalculator;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 退款规则计算：纯函数，无需数据库 */
class RefundCalculatorTest {

    private final RefundCalculator calculator = new RefundCalculator();

    private static OrderItem item(long id, String name, long unitPrice, int quantity, int refundedQty) {
        OrderItem i = new OrderItem();
        i.setId(id);
        i.setDishName(name);
        i.setUnitPrice(unitPrice);
        i.setQuantity(quantity);
        i.setRefundedQty(refundedQty);
        return i;
    }

    @Test
    void mergesSameLineAndSumsAmount() {
        List<RefundItem> out = new ArrayList<>();
        long amount = calculator.buildItems(
                List.of(item(1, "奶茶", 1200, 3, 0), item(2, "红烧肉", 3800, 1, 0)),
                List.of(new ItemInput(1L, 1), new ItemInput(1L, 1), new ItemInput(2L, 1)), out);
        assertThat(amount).isEqualTo(1200 * 2 + 3800);
        assertThat(out).hasSize(2);
        assertThat(out.get(0).getQuantity()).isEqualTo(2);
    }

    @Test
    void rejectsQuantityBeyondRefundableAndForeignLines() {
        List<OrderItem> items = List.of(item(1, "奶茶", 1200, 2, 1));
        assertThatThrownBy(() -> calculator.buildItems(items, List.of(new ItemInput(1L, 2)), new ArrayList<>()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("可退 1 份");
        assertThatThrownBy(() -> calculator.buildItems(items, List.of(new ItemInput(99L, 1)), new ArrayList<>()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("不属于该订单");
    }

    @Test
    void afterSaleWindowStartsAtDeliveryAndOnlyAppliesToDoneOrders() {
        Order making = new Order();
        making.setStatus(OrderStatus.MAKING);
        making.setCreatedAt(OffsetDateTime.now().minusDays(10));
        assertThat(calculator.withinAfterSaleWindow(making, 24)).isTrue();

        Order done = new Order();
        done.setStatus(OrderStatus.DONE);
        done.setCreatedAt(OffsetDateTime.now().minusHours(30));
        done.setDoneAt(OffsetDateTime.now().minusHours(2));   // 下单 30 小时前、送达 2 小时前
        assertThat(calculator.withinAfterSaleWindow(done, 24)).isTrue();
        done.setDoneAt(OffsetDateTime.now().minusHours(25));
        assertThat(calculator.withinAfterSaleWindow(done, 24)).isFalse();
    }
}
