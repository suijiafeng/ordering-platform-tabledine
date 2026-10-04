package com.example.ordering.module.table.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.config.AppProperties;
import com.example.ordering.module.store.entity.Store;
import com.example.ordering.module.store.service.StoreService;
import com.example.ordering.module.table.dto.QrResolveView;
import com.example.ordering.module.table.dto.TableBatchRequest;
import com.example.ordering.module.table.dto.TableRequest;
import com.example.ordering.module.table.dto.TableView;
import com.example.ordering.module.table.entity.DiningTable;
import com.example.ordering.module.table.mapper.DiningTableMapper;
import com.example.ordering.security.LoginUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TableService {

    private final DiningTableMapper tableMapper;
    private final StoreService storeService;
    private final String qrBaseUrl;

    public TableService(DiningTableMapper tableMapper, StoreService storeService, AppProperties appProperties) {
        this.tableMapper = tableMapper;
        this.storeService = storeService;
        String base = appProperties.getQr().getBaseUrl();
        this.qrBaseUrl = base.endsWith("/") ? base : base + "/";
    }

    // ==================== 顾客端 ====================

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

    // ==================== 商家端（多租户插件限定当前门店） ====================

    /** 按桌号自然排序（A2 排在 A10 前面） */
    public List<TableView> list() {
        return tableMapper.selectList(Wrappers.<DiningTable>lambdaQuery()).stream()
                .sorted(Comparator.comparing(DiningTable::getCode, TableService::naturalCompare))
                .map(t -> TableView.of(t, qrBaseUrl))
                .toList();
    }

    public TableView create(TableRequest req) {
        DiningTable t = new DiningTable();
        t.setStoreId(LoginUser.currentStaff().storeId());
        t.setCode(req.code().trim());
        t.setStatus(req.status() != null ? req.status() : DiningTable.STATUS_ENABLED);
        t.setQrToken(QrTokenGenerator.next());
        insertOrConflict(t);
        return TableView.of(t, qrBaseUrl);
    }

    /** 批量新建；已存在的桌号跳过 */
    // 不开事务：PostgreSQL 里事务内捕获唯一键冲突后事务已中止，后续语句全部失败；
    // 本接口语义是「逐张新建、已存在跳过」，每张独立提交即可
    public List<TableView> createBatch(TableBatchRequest req) {
        if (req.from() > req.to() || req.to() - req.from() >= 200) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "序号范围不合法（一次最多 200 张）");
        }
        String prefix = req.prefix() == null ? "" : req.prefix().trim();
        Set<String> existing = tableMapper.selectList(Wrappers.<DiningTable>lambdaQuery()
                        .select(DiningTable::getCode))
                .stream().map(DiningTable::getCode).collect(Collectors.toSet());
        Long storeId = LoginUser.currentStaff().storeId();
        List<TableView> created = new ArrayList<>();
        for (int i = req.from(); i <= req.to(); i++) {
            String code = prefix + i;
            if (existing.contains(code)) {
                continue;
            }
            DiningTable t = new DiningTable();
            t.setStoreId(storeId);
            t.setCode(code);
            t.setStatus(DiningTable.STATUS_ENABLED);
            t.setQrToken(QrTokenGenerator.next());
            try {
                tableMapper.insert(t);
            } catch (DuplicateKeyException e) {
                // 并发双击：对方刚插入了同一桌号，按「已存在」跳过（需要独立事务避免整批回滚）
                continue;
            }
            created.add(TableView.of(t, qrBaseUrl));
        }
        return created;
    }

    public TableView update(Long id, TableRequest req) {
        DiningTable t = require(id);
        t.setCode(req.code().trim());
        if (req.status() != null) {
            t.setStatus(req.status());
        }
        try {
            tableMapper.updateById(t);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ErrorCode.CONFLICT, "桌号已存在");
        }
        return TableView.of(t, qrBaseUrl);
    }

    /** 删除桌台。历史订单保存了桌号快照，不受影响 */
    public void delete(Long id) {
        require(id);
        tableMapper.deleteById(id);
    }

    /** 重置桌码：旧码立即失效，需要重新打印 */
    public TableView resetQr(Long id) {
        DiningTable t = require(id);
        t.setQrToken(QrTokenGenerator.next());
        tableMapper.updateById(t);
        return TableView.of(t, qrBaseUrl);
    }

    private void insertOrConflict(DiningTable t) {
        try {
            tableMapper.insert(t);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ErrorCode.CONFLICT, "桌号已存在");
        }
    }

    private DiningTable require(Long id) {
        DiningTable t = id == null ? null : tableMapper.selectById(id);
        if (t == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "桌台不存在");
        }
        return t;
    }

    /** 自然排序：数字部分按数值比较 */
    static int naturalCompare(String a, String b) {
        int i = 0;
        int j = 0;
        while (i < a.length() && j < b.length()) {
            char ca = a.charAt(i);
            char cb = b.charAt(j);
            if (Character.isDigit(ca) && Character.isDigit(cb)) {
                int si = i;
                int sj = j;
                while (i < a.length() && Character.isDigit(a.charAt(i))) {
                    i++;
                }
                while (j < b.length() && Character.isDigit(b.charAt(j))) {
                    j++;
                }
                String na = a.substring(si, i).replaceFirst("^0+(?=.)", "");
                String nb = b.substring(sj, j).replaceFirst("^0+(?=.)", "");
                int cmp = na.length() != nb.length() ? Integer.compare(na.length(), nb.length()) : na.compareTo(nb);
                if (cmp != 0) {
                    return cmp;
                }
            } else {
                if (ca != cb) {
                    return Character.compare(ca, cb);
                }
                i++;
                j++;
            }
        }
        return Integer.compare(a.length() - i, b.length() - j);
    }
}
