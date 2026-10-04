package com.example.ordering.module.wallet.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.PageResult;
import com.example.ordering.module.customer.entity.Customer;
import com.example.ordering.module.customer.mapper.CustomerMapper;
import com.example.ordering.module.wallet.dto.WalletTransactionView;
import com.example.ordering.module.wallet.entity.WalletTransaction;
import com.example.ordering.module.wallet.entity.WalletTransactionType;
import com.example.ordering.module.wallet.mapper.WalletTransactionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * 会员余额钱包：充值、下单扣费、退款返还，每次变动写一条流水。
 * <p>
 * 资金规则：
 * <ul>
 *   <li>余额只通过 {@link CustomerMapper#deductBalance} / {@link CustomerMapper#creditBalance} 的条件更新变动，
 *       扣费在余额不足时影响 0 行，并发下不会扣成负数</li>
 *   <li>扣费按商户订单号幂等、返还按退款单号幂等（部分唯一索引兜底）：支付 / 退款链路的重试不会重复扣款或重复返还</li>
 * </ul>
 * 事务边界：充值、扣费是数据库事务（@Transactional），加入调用方事务；
 * 退款返还必须在调用方的事务里执行（RefundService 锁住退款单后调用），见 {@link #refund}。
 */
@Slf4j
@Service
public class WalletService {

    private final CustomerMapper customerMapper;
    private final WalletTransactionMapper transactionMapper;

    public WalletService(CustomerMapper customerMapper, WalletTransactionMapper transactionMapper) {
        this.customerMapper = customerMapper;
        this.transactionMapper = transactionMapper;
    }

    /** 商家充值：余额增加，返回充值后的余额 */
    @Transactional
    public long recharge(Customer member, long amountInCents, Long operatorId, String remark) {
        if (amountInCents <= 0) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "充值金额必须大于 0");
        }
        Long after = customerMapper.creditBalance(member.getId(), amountInCents);
        WalletTransaction txn = newTransaction(member.getStoreId(), member.getId(), WalletTransactionType.RECHARGE, amountInCents, after);
        txn.setOperatorId(operatorId);
        txn.setRemark(remark);
        transactionMapper.insert(txn);
        log.info("会员 {} 充值 {} 分，余额 {} 分，操作人 {}", member.getId(), amountInCents, after, operatorId);
        return after;
    }

    /**
     * 下单扣费（余额支付渠道）：余额不足抛 42203，本方法所在事务回滚。
     * 同一商户订单号已扣过费时直接返回（幂等），不会二次扣款。
     */
    @Transactional
    public long pay(Long customerId, Long storeId, Long orderId, String outTradeNo, long amountInCents) {
        WalletTransaction existing = findByOutTradeNo(outTradeNo);
        if (existing != null) {
            return existing.getBalanceAfter();
        }
        Long after = customerMapper.deductBalance(customerId, amountInCents);
        if (after == null) {
            throw new BusinessException(ErrorCode.BALANCE_INSUFFICIENT);
        }
        WalletTransaction txn = newTransaction(storeId, customerId, WalletTransactionType.PAY, amountInCents, after);
        txn.setOrderId(orderId);
        txn.setOutTradeNo(outTradeNo);
        try {
            transactionMapper.insert(txn);
        } catch (DuplicateKeyException e) {
            // 并发重复发起同一笔支付：另一事务已扣款，本事务回滚（余额扣减一并回滚）
            throw new BusinessException(ErrorCode.CONFLICT, "支付正在处理中，请刷新查看");
        }
        return after;
    }

    /**
     * 退款返还：按退款单号幂等。返回 true 表示本次新返还，false 表示该退款单之前已返还过。
     * <ul>
     *   <li>原支付必须是余额扣费（按商户订单号找到 PAY 流水），否则抛状态冲突</li>
     *   <li>同一笔支付累计返还不能超过扣费金额（锁住扣费流水后求和），否则抛退款超额——
     *       这是余额层面的最后一道防线，即使上层的订单可退余额校验因并发失效也不会多退</li>
     * </ul>
     * 事务：必须在调用方事务内执行（MANDATORY）。出错时抛异常，由调用方回滚整个事务；
     * 校验都在写之前完成，不会留下半笔返还。
     */
    @Transactional(propagation = Propagation.MANDATORY, noRollbackFor = BusinessException.class)
    public boolean refund(String refundNo, String outTradeNo, long amountInCents) {
        if (findByRefundNo(refundNo) != null) {
            return false;
        }
        WalletTransaction paid = transactionMapper.selectOne(Wrappers.<WalletTransaction>lambdaQuery()
                .eq(WalletTransaction::getType, WalletTransactionType.PAY)
                .eq(WalletTransaction::getOutTradeNo, outTradeNo)
                .last("LIMIT 1 FOR UPDATE"));
        if (paid == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "该支付不是余额支付，无法原路返还");
        }
        long refunded = transactionMapper.selectList(Wrappers.<WalletTransaction>lambdaQuery()
                        .eq(WalletTransaction::getType, WalletTransactionType.REFUND)
                        .eq(WalletTransaction::getOutTradeNo, outTradeNo))
                .stream().mapToLong(WalletTransaction::getAmount).sum();
        if (refunded + amountInCents > paid.getAmount()) {
            log.error("退款 {} 返还 {} 分将超过支付 {} 的扣费 {} 分（已返还 {} 分），拒绝返还",
                    refundNo, amountInCents, outTradeNo, paid.getAmount(), refunded);
            throw new BusinessException(ErrorCode.REFUND_AMOUNT_EXCEEDED, "累计退款将超过该笔支付金额");
        }
        Long after = customerMapper.creditBalance(paid.getCustomerId(), amountInCents);
        WalletTransaction txn = newTransaction(paid.getStoreId(), paid.getCustomerId(), WalletTransactionType.REFUND, amountInCents, after);
        txn.setOrderId(paid.getOrderId());
        txn.setOutTradeNo(outTradeNo);
        txn.setRefundNo(refundNo);
        // 同一退款单的并发返还已由调用方的退款单行锁串行化；万一仍撞唯一索引，异常向上抛出，整个事务回滚
        transactionMapper.insert(txn);
        log.info("退款 {} 已返还会员 {} 余额 {} 分，余额 {} 分", refundNo, paid.getCustomerId(), amountInCents, after);
        return true;
    }

    public WalletTransaction findByOutTradeNo(String outTradeNo) {
        return transactionMapper.selectOne(Wrappers.<WalletTransaction>lambdaQuery()
                .eq(WalletTransaction::getType, WalletTransactionType.PAY)
                .eq(WalletTransaction::getOutTradeNo, outTradeNo)
                .last("LIMIT 1"));
    }

    public WalletTransaction findByRefundNo(String refundNo) {
        return transactionMapper.selectOne(Wrappers.<WalletTransaction>lambdaQuery()
                .eq(WalletTransaction::getType, WalletTransactionType.REFUND)
                .eq(WalletTransaction::getRefundNo, refundNo)
                .last("LIMIT 1"));
    }

    /** 某会员的流水，按时间倒序 */
    public PageResult<WalletTransactionView> transactions(Long customerId, int page, int pageSize) {
        Page<WalletTransaction> p = transactionMapper.selectPage(new Page<>(page, pageSize),
                Wrappers.<WalletTransaction>lambdaQuery()
                        .eq(WalletTransaction::getCustomerId, customerId)
                        .orderByDesc(WalletTransaction::getId));
        return PageResult.of(p, WalletTransactionView::of);
    }

    private static WalletTransaction newTransaction(Long storeId, Long customerId, WalletTransactionType type, long amount, long after) {
        WalletTransaction txn = new WalletTransaction();
        txn.setStoreId(storeId);
        txn.setCustomerId(customerId);
        txn.setType(type);
        txn.setAmount(amount);
        txn.setBalanceAfter(after);
        txn.setCreatedAt(OffsetDateTime.now());
        return txn;
    }
}
