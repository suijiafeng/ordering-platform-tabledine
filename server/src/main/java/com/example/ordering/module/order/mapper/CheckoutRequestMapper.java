package com.example.ordering.module.order.mapper;

import com.example.ordering.module.order.entity.CheckoutRequest;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 只加入调用方事务：创建和放弃必须持有同一请求行锁，直到业务事务提交或回滚。 */
public interface CheckoutRequestMapper {

    @Insert("""
            INSERT INTO checkout_request (customer_id, client_request_id)
            VALUES (#{customerId}, #{clientRequestId})
            ON CONFLICT (customer_id, client_request_id) DO NOTHING
            """)
    int ensureExists(@Param("customerId") Long customerId, @Param("clientRequestId") String clientRequestId);

    @Select("""
            SELECT customer_id, client_request_id, abandoned FROM checkout_request
            WHERE customer_id = #{customerId} AND client_request_id = #{clientRequestId}
            FOR UPDATE
            """)
    CheckoutRequest lock(@Param("customerId") Long customerId, @Param("clientRequestId") String clientRequestId);

    @Update("""
            UPDATE checkout_request SET abandoned = TRUE
            WHERE customer_id = #{customerId} AND client_request_id = #{clientRequestId}
            """)
    int abandon(@Param("customerId") Long customerId, @Param("clientRequestId") String clientRequestId);
}
