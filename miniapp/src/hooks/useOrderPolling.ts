import { useCallback, useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { fetchOrder } from '../api/order'
import type { OrderDetail } from '../api/types'
import { ApiError, NOT_FOUND } from '../utils/apiError'
import { isRefundUnresolved } from '../utils/errors'

const POLL_INTERVAL_MS = 5000

export interface OrderPolling {
  order: OrderDetail | null
  /** 最近一次加载失败（可恢复，轮询会继续重试） */
  loadFailed: boolean
  /** 不可恢复的错误（订单不存在 / 账号不可用）：已停止轮询，值为给用户看的原因 */
  fatal: string | null
  /** 立即重新加载一次（用于操作成功后），并按需续上轮询 */
  refresh: () => Promise<void>
}

/** 订单是否已有最终结果：订单已结束，且没有尚未了结的退款 */
function isSettled(order: OrderDetail): boolean {
  return ['DONE', 'CLOSED', 'CANCELLED'].includes(order.status) && !order.refunds.some((r) => isRefundUnresolved(r.status))
}

/**
 * 订单详情的加载与轮询，跟随页面生命周期：
 * - 页面显示时开始，隐藏 / 卸载时停止（卸载时在途请求返回后也不会再排下一次）
 * - 订单有最终结果后停止；一次加载失败不停止，下一轮自动恢复
 * - 订单不存在 / 账号不可用时停止并给出原因
 * 错误提示责任：请求带 silent，不弹 Toast，由页面根据 loadFailed / fatal 展示。
 */
export function useOrderPolling(orderNo: string): OrderPolling {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const pageVisible = useRef(false)
  const stopped = useRef(false)

  const loadOnce = useCallback(async (): Promise<OrderDetail | null> => {
    try {
      const o = await fetchOrder(orderNo, true)
      setOrder(o)
      setLoadFailed(false)
      return o
    } catch (e) {
      if (!(e instanceof ApiError)) {
        throw e
      }
      if (e.code === NOT_FOUND) {
        stopped.current = true
        setFatal('订单不存在或不属于当前账号')
      } else if (e.statusCode === 401 || e.code === 40103) {
        stopped.current = true
        setFatal(e.message || '账号不可用')
      } else {
        setLoadFailed(true)
      }
      return null
    }
  }, [orderNo])

  const pollLoop = useCallback(async () => {
    clearTimeout(timer.current)
    if (!pageVisible.current) return
    const o = await loadOnce()
    if (!pageVisible.current || stopped.current) return
    if (o == null || !isSettled(o)) {
      timer.current = setTimeout(pollLoop, POLL_INTERVAL_MS)
    }
  }, [loadOnce])

  useDidShow(() => {
    pageVisible.current = true
    void pollLoop()
  })
  useDidHide(() => {
    pageVisible.current = false
    clearTimeout(timer.current)
  })
  useEffect(
    () => () => {
      pageVisible.current = false
      clearTimeout(timer.current)
    },
    [],
  )

  return { order, loadFailed, fatal, refresh: pollLoop }
}
