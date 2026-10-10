'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchOrder } from '@/lib/api'
import { isRefundUnresolved, NOT_FOUND, UNAUTHORIZED } from '@/lib/errors'
import type { OrderDetail } from '@/lib/types'

const POLL_INTERVAL_MS = 5000

/** 订单终态且没有未了结的退款：不会再变化，停止轮询 */
const isSettled = (order: OrderDetail) =>
  ['DONE', 'CLOSED', 'CANCELLED'].includes(order.status) && !order.refunds.some((r) => isRefundUnresolved(r.status))

/**
 * 订单详情加载与自动刷新（与小程序 useOrderPolling 同一套规则）：
 * - 未结束的订单每 5 秒刷新一次；页面不可见时暂停，回到前台立即刷新
 * - refresh()（用户操作后调用）会重新开始轮询：已完成的订单申请退款后，仍能看到商家审核结果
 * - 订单不存在 / 未登录：停止轮询，fatal 给出原因
 */
export function useOrderPolling(orderNo: string) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [fatal, setFatal] = useState<string | null>(orderNo ? null : '缺少订单号')
  const timer = useRef<number | undefined>(undefined)
  const stopped = useRef(false)

  const refresh = useCallback(async () => {
    clearTimeout(timer.current)
    if (!orderNo || stopped.current) return
    let next: OrderDetail | null = null
    try {
      next = await fetchOrder(orderNo)
      setOrder(next)
      setLoadFailed(false)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      if (e.code === NOT_FOUND || e.code === UNAUTHORIZED || e.status === 404) {
        stopped.current = true
        setFatal(e.code === UNAUTHORIZED ? '请先登录' : '订单不存在')
        return
      }
      setLoadFailed(true)  // 网络抖动：保留已显示的订单，稍后自动重试
    }
    if (stopped.current || document.hidden || (next && isSettled(next))) return
    timer.current = window.setTimeout(() => { void refresh() }, POLL_INTERVAL_MS)
  }, [orderNo])

  useEffect(() => {
    stopped.current = false
    void refresh()
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer.current)
      else void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped.current = true
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  return { order, loadFailed, fatal, refresh }
}
