'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchOrders } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { orderStatusText } from '@/lib/format'
import type { OrderSummary } from '@/lib/types'

const SETTLED = new Set(['DONE', 'CLOSED', 'CANCELLED'])
/** 回到前台时，距上次检查超过这个时间就重新查一次 */
const STALE_AFTER_MS = 20_000
/** 只看最近几笔：进行中的订单一定是最新的几笔之一 */
const RECENT_COUNT = 5

/**
 * 菜单页顶部的「进行中订单」入口：下单后回到菜单，不必经「我的 → 我的订单」也能看到状态。
 * 从历史订单里取最近一笔未结束的订单（不依赖本地记录，换设备、清缓存也能显示）；未登录时不请求。
 */
export function ActiveOrderBanner() {
  const router = useRouter()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const checkedAt = useRef(0)

  const check = useCallback(async () => {
    if (!getToken()) { setOrder(null); return }
    try {
      const { list } = await fetchOrders(1, RECENT_COUNT)
      setOrder(list.find((item) => !SETTLED.has(item.status)) ?? null)
    } catch (e) {
      ignoreShownError(e)  // 网络抖动：保留上次结果，下次回到前台再查
    } finally {
      checkedAt.current = Date.now()
    }
  }, [])

  useEffect(() => { void check() }, [check])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && Date.now() - checkedAt.current > STALE_AFTER_MS) void check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [check])

  if (!order) return null
  return (
    <button className="menu-banner" onClick={() => router.push(`/order?orderNo=${encodeURIComponent(order.orderNo)}`)}>
      <span className="dot" />
      <span className="grow">
        您有一笔订单<strong>{orderStatusText(order.status)}</strong>
        {order.status === 'PENDING_PAY' ? '，请尽快支付' : ''}
      </span>
      <span className="arrow">查看 ›</span>
    </button>
  )
}
