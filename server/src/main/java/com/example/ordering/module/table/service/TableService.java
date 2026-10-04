package com.example.ordering.module.table.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.module.table.dto.QrResolveView;
import com.example.ordering.module.table.entity.DiningTable;
import com.example.ordering.module.table.mapper.DiningTableMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class TableService {

    private final DiningTableMapper tableMapper;
    private final StoreService storeService;

    public TableService(DiningTableMapper tableMapper, StoreService storeService) {
        this.tableMapper = tableMapper;
        this.storeService = storeService;
    }

    /** 桌码解析：token 不存在、桌台停用都视为桌码失效 */
    public QrResolveView resolve(String qrToken) {
        if (!StringUtils.hasText(qrToken) || qrToken.length() > 64) {
            throw new BusinessException(ErrorCode.QR_INVALID);
        }
        DiningTable table = tableMapper.selectOne(Wrappers.<DiningTable>lambdaQuery()
                .eq(DiningTable::getQrToken, qrToken));
        if (table == null || table.getStatus() == null || table.getStatus() != DiningTable.STATUS_ENABLED) {
            throw new BusinessException(ErrorCode.QR_INVALID);
        }
        Store store = storeService.getRequired(table.getStoreId());
        return new QrResolveView(store.getId(), store.getName(), store.isOpen(), table.getId(), table.getCode());
    }
}
