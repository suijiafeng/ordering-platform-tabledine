'use client'

import { InfiniteScroll } from 'antd-mobile'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWallet } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { dateTime, yuan } from '@/lib/format'
import type { WalletTransaction } from '@/lib/types'
import { AppBar, Card, EmptyState, PillButton, Skeleton, Spinner } from '@/components/ui'

const PAGE_SIZE = 20
const TEXT: Record<WalletTransaction['type'], string> = { RECHARGE: '充值', PAY: '点餐消费', REFUND: '退款退回' }
/** 支付单号 = 订单号，重试支付时后面会带 P2、P3；订单号本身是纯数字 */
const orderNoOf = (outTradeNo: string) => outTradeNo.split('P')[0]

/** 余额明细：按时间倒序展示充值、点餐消费与退款退回，支持分页加载。 */
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

  return (
    <div className="screen">
      <AppBar title="余额明细" fallback="/me" />
      <div className="body-pad">
        {!loaded ? <Skeleton rows={3} variant="card" label="记录加载中…" />
          : failed && !transactions.length
            ? <EmptyState icon="!" title="记录加载失败" desc="请检查网络后重试" action={<PillButton onClick={() => void load(1).catch(() => undefined)}>重新加载</PillButton>} />
            : <Card>
              {transactions.length === 0 && <EmptyState inset title="还没有收支记录" desc="充值、点餐消费和退款都会记在这里" />}
              {transactions.map((item) => (
                <div
                  className="flow-row"
                  key={item.id}
                  onClick={item.outTradeNo ? () => router.push(`/order?orderNo=${encodeURIComponent(orderNoOf(item.outTradeNo!))}`) : undefined}
                >
                  <div>
                    <div className="t-item">{TEXT[item.type]}{item.remark ? ` · ${item.remark}` : ''}</div>
                    <div className="t-cap" style={{ marginTop: 4 }}>{dateTime(item.createdAt)}</div>
                    {item.outTradeNo && <div className="t-faint" style={{ marginTop: 2 }}>订单 {orderNoOf(item.outTradeNo)} ›</div>}
                  </div>
                  <div className="flow-amt">
                    <span className={item.credit ? 'ok' : ''}>{item.credit ? '+' : '-'}¥{yuan(item.amount)}</span>
                    <div className="t-cap" style={{ marginTop: 4, fontWeight: 400 }}>余额 ¥{yuan(item.balanceAfter)}</div>
                  </div>
                </div>
              ))}
              {transactions.length > 0 && (
                <InfiniteScroll loadMore={() => load(page + 1)} hasMore={hasMore}>
                  {hasMore ? <Spinner /> : <span className="t-cap">没有更多了</span>}
                </InfiniteScroll>
              )}
            </Card>}
      </div>
    </div>
  )
}
