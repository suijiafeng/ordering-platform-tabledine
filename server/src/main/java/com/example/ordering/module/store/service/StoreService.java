package com.example.ordering.module.store.service;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.mapper.StoreMapper;
import org.springframework.stereotype.Service;

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
}
