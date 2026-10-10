'use client'

import { InfiniteScroll, PullToRefresh } from 'antd-mobile'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelOrder, fetchOrders } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { countdownText, dateTime, orderStatusText, yuan } from '@/lib/format'
import type { OrderStatus, OrderSummary } from '@/lib/types'
import { useCountdown } from '@/hooks/useCountdown'
import { confirmDialog } from '@/lib/ui'
import { notify } from '@/store/feedback'
import { AppBar, EmptyState, PillButton, Skeleton, Spinner, Tag, type Tone } from '@/components/ui'

const PAGE_SIZE = 20
type Filter = 'all' | 'active' | 'finished'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'finished', label: '已结束' },
]
const FINISHED = new Set<OrderStatus>(['DONE', 'CLOSED', 'CANCELLED'])
const matchesFilter = (order: OrderSummary, filter: Filter) =>
  filter === 'all' || (filter === 'active') !== FINISHED.has(order.status)

/** 状态标签配色：待支付琥珀、待接单 / 制作中 / 待取餐蓝、已完成绿、已关闭 / 已取消灰 */
function tone(status: OrderStatus): Tone {
  if (status === 'PENDING_PAY') return 'pending'
  if (status === 'DONE') return 'success'
  if (status === 'CLOSED' || status === 'CANCELLED') return 'muted'
  return 'active'
}

/** 待支付订单的剩余时间 */
function PendingPayHint({ payExpireAt }: { payExpireAt: string | null }) {
  const secondsLeft = useCountdown(payExpireAt)
  if (secondsLeft == null) return <span className="grow" />
  return secondsLeft > 0
    ? <span className="grow countdown">剩余 {countdownText(secondsLeft)} 支付</span>
    : <span className="grow t-cap">支付已超时，订单即将关闭</span>
}

/**
 * 我的订单：按时间倒序，下拉刷新，触底加载更多。
 * 「进行中 / 已结束」在已加载的数据上筛选（接口没有状态参数）；筛选后不足一屏时 InfiniteScroll 会继续翻页。
 */
export default function OrdersPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
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

  const openOrder = (orderNo: string) => router.push(`/order?orderNo=${encodeURIComponent(orderNo)}`)

  /** 列表里直接取消待支付订单；取消后刷新第一页 */
  const cancel = async (orderNo: string) => {
    if (cancelling || !(await confirmDialog('确定取消订单吗？', '取消后需重新下单', '确定取消'))) return
    setCancelling(orderNo)
    try {
      await cancelOrder(orderNo)
      notify('订单已取消', 'success')
      await load(1)
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setCancelling(null)
    }
  }

  const hasMore = loaded && !failed && orders.length < total
  const visible = orders.filter((order) => matchesFilter(order, filter))

  let content: React.ReactNode
  if (!loaded) {
    content = <Skeleton rows={3} variant="card" label="订单加载中…" />
  } else if (failed && !orders.length) {
    content = <EmptyState icon="!" title="订单加载失败" desc="请检查网络后重试" action={<PillButton onClick={() => void load(1)}>重新加载</PillButton>} />
  } else if (!orders.length) {
    content = <EmptyState title="还没有订单" desc="下单后可在这里查看进度" action={<PillButton onClick={() => router.push('/')}>去点餐</PillButton>} />
  } else {
    content = <>
    {!visible.length && !hasMore && <EmptyState inset title={filter === 'active' ? '没有进行中的订单' : '没有已结束的订单'} desc="切换上面的筛选看看其他订单" />}
    {visible.map((order) => (
      <article className="order-card" key={order.orderNo} onClick={() => openOrder(order.orderNo)}>
        <div className="order-top">
          <span className="t-cap">订单号：{order.orderNo}</span>
          <Tag tone={tone(order.status)}>{orderStatusText(order.status)}</Tag>
        </div>
        <div className="order-items">
          {order.items.slice(0, 3).map((item) => `${item.dishName} ×${item.quantity}`).join('、')}
          {order.items.length > 3 ? ' 等' : ''}
        </div>
        <div className="order-bottom">
          <span className="t-cap">{dateTime(order.createdAt)} · {order.tableCode}桌 · 共 {order.itemCount} 件</span>
          <span className="order-sum">合计 ¥{yuan(order.payAmount)}</span>
        </div>
        {order.refundedAmount > 0 && <div className="t-cap ok" style={{ marginTop: 8 }}>已退款 ¥{yuan(order.refundedAmount)}</div>}
        {order.status === 'PENDING_PAY' && (
          <div className="order-acts" onClick={(e) => e.stopPropagation()}>
            <PendingPayHint payExpireAt={order.payExpireAt} />
            <PillButton size="sm" variant="plain" loading={cancelling === order.orderNo} onClick={() => void cancel(order.orderNo)}>取消订单</PillButton>
            <PillButton size="sm" onClick={() => openOrder(order.orderNo)}>去支付</PillButton>
          </div>
        )}
      </article>
    ))}
    <InfiniteScroll loadMore={() => load(page + 1)} hasMore={hasMore}>
      {hasMore ? <Spinner /> : <span className="t-cap">没有更多了</span>}
    </InfiniteScroll>
    </>
  }

  return (
    <div className="screen">
      <AppBar title="我的订单" />
      <div className="order-tabs">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={`order-tab ${filter === item.key ? 'on' : ''}`.trim()}
            onClick={() => { setFilter(item.key); window.scrollTo(0, 0) }}
          >{item.label}</button>
        ))}
      </div>
      <PullToRefresh onRefresh={() => load(1)}>
        <div className="body-pad">{content}</div>
      </PullToRefresh>
    </div>
  )
}
