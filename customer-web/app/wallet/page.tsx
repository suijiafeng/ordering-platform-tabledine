'use client'

import { Button, ErrorBlock, InfiniteScroll, SpinLoading } from 'antd-mobile'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWallet } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { dateTime, yuan } from '@/lib/format'
import type { WalletTransaction } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'

const PAGE_SIZE = 20
const TRANSACTION_TEXT: Record<WalletTransaction['type'], string> = { RECHARGE: '充值', PAY: '消费', REFUND: '退款返还' }

/** 支付单号 = 订单号，重试支付时后面会带 P2、P3；订单号本身是纯数字 */
const orderNoOf = (outTradeNo: string) => outTradeNo.split('P')[0]

/** 余额流水：按时间倒序展示充值、消费与退款返还，支持分页加载。 */
export default function WalletPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (nextPage: number) => {
    try {
      const result = await fetchWallet(nextPage, PAGE_SIZE)
      setTransactions((current) => {
        if (nextPage === 1) return result.list
        const seen = new Set(current.map((item) => item.id))
        return [...current, ...result.list.filter((item) => !seen.has(item.id))]
      })
      setPage(nextPage)
      setTotal(result.total)
      setFailed(false)
    } catch (error) {
      ignoreShownError(error)
      if (nextPage === 1) setFailed(true)
      throw error
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { void load(1).catch(() => undefined) }, [load])

  const hasMore = loaded && !failed && transactions.length < total

  return <div className="page">
    <PageHeader fallback="/me">余额流水</PageHeader>
    <div className="content-page">
      {!loaded ? <div className="empty-state"><SpinLoading /></div>
        : failed && !transactions.length ? <ErrorBlock status="disconnected" title="流水加载失败" description={<Button onClick={() => void load(1).catch(() => undefined)}>重试</Button>} />
          : <section className="section-card">
            {transactions.length === 0 && <ErrorBlock status="empty" title="暂无流水" description="" />}
            {transactions.map((item) => (
              <div
                className={`row ${item.outTradeNo ? 'wallet-row' : ''}`}
                key={item.id}
                onClick={item.outTradeNo ? () => router.push(`/order?orderNo=${encodeURIComponent(orderNoOf(item.outTradeNo!))}`) : undefined}
              >
                <div className="row-main">
                  <strong>{TRANSACTION_TEXT[item.type]}{item.remark ? ` · ${item.remark}` : ''}</strong>
                  <div className="muted">{dateTime(item.createdAt)}</div>
                  {item.outTradeNo && <div className="muted small order-link">订单 {orderNoOf(item.outTradeNo)}</div>}
                </div>
                <div className="amount-cell">
                  <strong className={item.credit ? 'credit' : ''}>{item.credit ? '+' : '-'}¥{yuan(item.amount)}</strong>
                  <div className="muted">余额 ¥{yuan(item.balanceAfter)}</div>
                </div>
              </div>
            ))}
            {transactions.length > 0 && (
              <InfiniteScroll loadMore={() => load(page + 1)} hasMore={hasMore}>
                {hasMore ? <SpinLoading /> : <span className="muted">没有更多了</span>}
              </InfiniteScroll>
            )}
          </section>}
    </div>
  </div>
}
