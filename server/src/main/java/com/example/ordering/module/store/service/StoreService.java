package com.example.ordering.module.store.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.store.dto.StoreUpdateRequest;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.mapper.StoreMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;

@Service
public class StoreService {

    private final StoreMapper storeMapper;

    public StoreService(StoreMapper storeMapper) {
        this.storeMapper = storeMapper;
    }

    public Store getRequired(Long storeId) {
        Store store = storeId == null ? null : storeMapper.selectById(storeId);
        if (store == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "店铺不存在");
        }
        return store;
    }

    /** 用 UpdateWrapper 显式设置，允许把 logo / 电话 / 地址等字段清空 */
    public Store update(Long storeId, StoreUpdateRequest req) {
        getRequired(storeId);
        storeMapper.update(null, Wrappers.<Store>lambdaUpdate()
                .set(Store::getName, req.name().trim())
                .set(Store::getLogo, blankToNull(req.logo()))
                .set(Store::getPhone, blankToNull(req.phone()))
                .set(Store::getAddress, blankToNull(req.address()))
                .set(Store::getBusinessHours, blankToNull(req.businessHours()))
                .set(Store::getAutoAccept, req.autoAccept())
                .set(Store::getPayTimeoutMin, req.payTimeoutMin())
                .set(Store::getAcceptTimeoutMin, req.acceptTimeoutMin())
                .set(Store::getAfterSaleHours, req.afterSaleHours())
                .set(Store::getUpdatedAt, OffsetDateTime.now())
                .eq(Store::getId, storeId));
        return getRequired(storeId);
    }

    /** 只改营业状态：整行 updateById 会覆盖同时保存的店铺设置 */
    public Store updateBusinessStatus(Long storeId, boolean open) {
        getRequired(storeId);
        storeMapper.update(null, Wrappers.<Store>lambdaUpdate()
                .set(Store::getBusinessStatus, open ? Store.STATUS_OPEN : Store.STATUS_CLOSED)
                .set(Store::getUpdatedAt, OffsetDateTime.now())
                .eq(Store::getId, storeId));
        return getRequired(storeId);
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
