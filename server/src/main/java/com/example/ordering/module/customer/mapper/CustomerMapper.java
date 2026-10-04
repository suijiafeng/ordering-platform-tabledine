package com.example.ordering.module.customer.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.ordering.module.customer.entity.Customer;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface CustomerMapper extends BaseMapper<Customer> {

    /**
     * 扣减余额（条件更新：余额不足时影响 0 行，返回 null）。
     * 用 UPDATE ... RETURNING 一次拿到扣减后的余额，避免并发下读到别人的中间值。
     * 写语句借 @Select 返回结果：必须刷新本地缓存，否则同一事务里重复调用会直接命中缓存、不执行 UPDATE。
     */
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    @Select("UPDATE customer SET balance = balance - #{amount}, updated_at = now() "
            + "WHERE id = #{id} AND balance >= #{amount} RETURNING balance")
    Long deductBalance(@Param("id") Long id, @Param("amount") long amount);

    /** 增加余额（充值 / 退款返还），返回增加后的余额（缓存说明同上） */
    @Options(flushCache = Options.FlushCachePolicy.TRUE, useCache = false)
    @Select("UPDATE customer SET balance = balance + #{amount}, updated_at = now() WHERE id = #{id} RETURNING balance")
    Long creditBalance(@Param("id") Long id, @Param("amount") long amount);
}
