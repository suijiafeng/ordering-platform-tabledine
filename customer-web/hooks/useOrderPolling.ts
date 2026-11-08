'use client'

import { useEffect, useState } from 'react'
import { ApiError, fetchOrder } from '@/lib/api'
import { NOT_FOUND, UNAUTHORIZED } from '@/lib/errors'
import type { OrderDetail } from '@/lib/types'
import { useVisiblePolling } from './useVisiblePolling'

/**
 * 订单详情加载与自动刷新（与小程序 useOrderPolling 同一套规则）：
 * - 包括已完成订单：商家仍可能主动退款，每 5 秒同步；隐藏时暂停，回到前台立即刷新
 * - 订单不存在 / 未登录：停止轮询，fatal 给出原因
 */
export function useOrderPolling(orderNo: string) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [fatal, setFatal] = useState<string | null>(orderNo ? null : '缺少订单号')
  useEffect(() => {
    setOrder(null)
    setLoadFailed(false)
    setFatal(orderNo ? null : '缺少订单号')
  }, [orderNo])

  const refresh = useVisiblePolling(async ({ isCurrent }) => {
    try {
      const next = await fetchOrder(orderNo)
      if (!isCurrent()) return
      setOrder(next)
      setLoadFailed(false)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      if (!isCurrent()) return
      if (e.code === NOT_FOUND || e.code === UNAUTHORIZED || e.status === 404) {
        setOrder(null)
        setFatal(e.code === UNAUTHORIZED ? '请先登录' : '订单不存在')
        return
      }
      setLoadFailed(true)  // 网络抖动：保留已显示的订单，稍后自动重试
    }
  }, { enabled: !!orderNo && !fatal, resetKey: orderNo })

  return { order, loadFailed, fatal, refresh }
}
