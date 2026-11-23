import { clockTime, displayStatus } from './format'
import type { OrderDetail, OrderStatus } from './types'

export const PROGRESS_STEPS = ['已支付', '已接单', '制作中', '已出餐', '已完成'] as const
export type ProgressStep = (typeof PROGRESS_STEPS)[number]

/** 当前进度下标：已支付 0 … 已完成 4；取消/关闭返回 null */
export function progressIndex(status: string, cookingStartedAt?: string | null): number | null {
  const shown = displayStatus(status, cookingStartedAt)
  switch (shown) {
    case 'PAID': return 0
    case 'ACCEPTED': return 1
    case 'MAKING': return 2
    case 'READY': return 3
    case 'DONE': return 4
    default: return null
  }
}

/**
 * 从状态日志与制作时间推导每一步的时刻。
 * 已接单取商家把订单打到 MAKING 的日志（非后厨开工）；制作中优先 cookingStartedAt。
 */
export function progressTimes(order: Pick<OrderDetail, 'logs' | 'paidAt' | 'cookingStartedAt'>): (string | null)[] {
  const logs = [...(order.logs ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const paid = order.paidAt || logs.find((log) => log.toStatus === 'PAID')?.createdAt || null
  const accepted = logs.find((log) => log.toStatus === 'MAKING' && log.operatorType !== 'KITCHEN')?.createdAt || null
  const cooking = order.cookingStartedAt
    || logs.find((log) => log.operatorType === 'KITCHEN')?.createdAt
    || null
  const ready = logs.find((log) => log.toStatus === 'READY')?.createdAt || null
  const done = logs.find((log) => log.toStatus === 'DONE')?.createdAt || null
  return [paid, accepted, cooking, ready, done].map((value) => clockTime(value) || null)
}

/** 已开始制作且尚未出餐时的分钟数；刚开工按 1 分钟计 */
export function cookingMinutes(order: Pick<OrderDetail, 'status' | 'cookingStartedAt'>, now = Date.now()): number | null {
  if (order.status !== 'MAKING' || !order.cookingStartedAt) return null
  const started = new Date(order.cookingStartedAt).getTime()
  if (Number.isNaN(started)) return null
  return Math.max(1, Math.floor((now - started) / 60_000))
}

export function statusHeroTitle(status: string, cookingStartedAt?: string | null) {
  const shown = displayStatus(status, cookingStartedAt)
  if (shown === 'MAKING') return '后厨制作中'
  if (shown === 'READY') return '已出餐'
  if (shown === 'DONE') return '已完成'
  if (shown === 'ACCEPTED') return '商家已接单'
  if (shown === 'PAID') return '待商家接单'
  if (shown === 'CANCELLED') return '已取消'
  if (shown === 'CLOSED') return '已关闭'
  return '处理中'
}

export function lastUpdatedLabel(order: Pick<OrderDetail, 'logs' | 'paidAt' | 'cookingStartedAt' | 'createdAt'>, now = Date.now()): string | null {
  const stamps = [
    order.createdAt,
    order.paidAt,
    order.cookingStartedAt,
    ...(order.logs ?? []).map((log) => log.createdAt),
  ].filter((value): value is string => !!value)
  if (!stamps.length) return null
  const latest = Math.max(...stamps.map((value) => new Date(value).getTime()).filter((n) => !Number.isNaN(n)))
  if (!Number.isFinite(latest)) return null
  const sec = Math.max(0, Math.floor((now - latest) / 1000))
  if (sec < 60) return `${Math.max(1, sec)} 秒前更新`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前更新`
  return `${Math.floor(sec / 3600)} 小时前更新`
}

export function isActiveOrder(status: OrderStatus) {
  return status === 'PAID' || status === 'MAKING' || status === 'READY' || status === 'DONE'
}
