'use client'

import { Button, ErrorBlock, InfiniteScroll, PullToRefresh, SpinLoading, Tag } from 'antd-mobile'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrders } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { countdownText, dateTime, orderStatusText, yuan } from '@/lib/format'
import type { OrderStatus, OrderSummary } from '@/lib/types'
import { useCountdown } from '@/hooks/useCountdown'
import { PageHeader } from '@/components/PageHeader'

const PAGE_SIZE = 20

function statusColor(status: OrderStatus): 'primary' | 'success' | 'default' {
  if (status === 'DONE') return 'success'
  if (status === 'CLOSED' || status === 'CANCELLED') return 'default'
  return 'primary'
}

/** 待支付订单的剩余时间 */
function PendingPayHint({ payExpireAt }: { payExpireAt: string | null }) {
  const secondsLeft = useCountdown(payExpireAt)
  if (secondsLeft == null) return null
  return secondsLeft > 0
    ? <span className="countdown">剩余 {countdownText(secondsLeft)} 支付</span>
    : <span className="muted">支付已超时，订单即将关闭</span>
}

/** 我的订单：按时间倒序，下拉刷新，触底加载更多 */
export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // 下拉刷新与加载更多可能交错：只采纳最后一次发起的请求
  const seq = useRef(0)

  const load = useCallback(async (nextPage: number) => {
    const mine = ++seq.current
    try {
      const result = await fetchOrders(nextPage, PAGE_SIZE)
      if (mine !== seq.current) return
      setOrders((old) => {
        if (nextPage === 1) return result.list
        const seen = new Set(old.map((o) => o.orderNo))
        return [...old, ...result.list.filter((o) => !seen.has(o.orderNo))]
      })
      setPage(nextPage)
      setTotal(result.total)
      setFailed(false)
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；首屏失败显示重试
      if (mine === seq.current && nextPage === 1) setFailed(true)
    } finally {
      if (mine === seq.current) setLoaded(true)
    }
  }, [])

  useEffect(() => { void load(1) }, [load])

  const hasMore = loaded && !failed && orders.length < total

  let content: React.ReactNode
  if (!loaded) {
    content = <div className="empty-state"><SpinLoading /></div>
  } else if (failed && !orders.length) {
    content = <ErrorBlock status="disconnected" title="订单加载失败" description={<Button onClick={() => void load(1)}>重试</Button>} />
  } else if (!orders.length) {
    content = <ErrorBlock status="empty" title="暂无订单" description={<Button color="primary" onClick={() => router.push('/')}>去点餐</Button>} />
  } else {
    content = <>
      {orders.map((order) => (
        <article className="order-card" key={order.orderNo} onClick={() => router.push(`/order?orderNo=${encodeURIComponent(order.orderNo)}`)}>
          <div className="order-head">
            <span className="muted">{dateTime(order.createdAt)} · 桌号 {order.tableCode}</span>
            <Tag color={statusColor(order.status)} fill={statusColor(order.status) === 'default' ? 'outline' : 'solid'}>
              {orderStatusText(order.status)}
            </Tag>
          </div>
          <div className="order-dishes">
            {order.items.slice(0, 3).map((item) => `${item.dishName} ×${item.quantity}`).join('、')}
            {order.items.length > 3 ? ' 等' : ''}
          </div>
          <div className="order-foot">
            {order.status === 'PENDING_PAY' ? <PendingPayHint payExpireAt={order.payExpireAt} /> : <span />}
            <span><span className="muted">共 {order.itemCount} 件 </span><strong>¥{yuan(order.payAmount)}</strong></span>
          </div>
          {order.refundedAmount > 0 && <div className="refunded">已退款 ¥{yuan(order.refundedAmount)}</div>}
          {order.status === 'PENDING_PAY' && <Button block color="primary" size="small" className="order-pay">去支付</Button>}
        </article>
      ))}
      <InfiniteScroll loadMore={() => load(page + 1)} hasMore={hasMore}>
        {hasMore ? <SpinLoading /> : <span className="muted">没有更多了</span>}
      </InfiniteScroll>
    </>
  }

  return (
    <div className="page">
      <PageHeader>我的订单</PageHeader>
      <PullToRefresh onRefresh={() => load(1)}>
        <div className="content-page">{content}</div>
      </PullToRefresh>
    </div>
  )
}
