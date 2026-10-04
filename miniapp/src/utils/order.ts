import type { OrderStatus, RefundStatus } from '../api/types'

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  PENDING_PAY: '待支付',
  PAID: '待商家接单',
  MAKING: '制作中',
  READY: '已出餐，即将送达',
  DONE: '已完成',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
}

export const REFUND_STATUS_TEXT: Record<RefundStatus, string> = {
  APPLYING: '待商家审核',
  PROCESSING: '退款中',
  SUCCESS: '已退款',
  FAILED: '退款失败，商家处理中',
  REJECTED: '商家已拒绝',
  WITHDRAWN: '已撤回',
  OFFLINE: '已线下退款',
}

/** 已发布的小程序可能晚于后端升级：未知状态给出兜底文案，不显示 undefined */
export const orderStatusText = (s: string) => (ORDER_STATUS_TEXT as Record<string, string>)[s] ?? '处理中'
export const refundStatusText = (s: string) => (REFUND_STATUS_TEXT as Record<string, string>)[s] ?? '处理中'

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 带秒的时间，用于状态时间线（同一分钟内可能发生多次流转） */
export function formatTimeWithSeconds(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 剩余秒数转 mm:ss；不足 0 显示 00:00 */
export function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`
}

/** 状态时间线上每一步的文案。顾客端看不到员工姓名，只区分「商家 / 系统 / 本人」 */
export function statusLogText(toStatus: string, operatorType: string | null | undefined): string {
  const who = operatorType === 'MERCHANT' ? '商家' : operatorType === 'CUSTOMER' ? '您' : '系统'
  switch (toStatus) {
    case 'PENDING_PAY': return '订单已提交，等待支付'
    case 'PAID': return '支付成功，等待商家接单'
    case 'MAKING': return who === '系统' ? '已自动接单，开始制作' : '商家已接单，开始制作'
    case 'READY': return '已出餐，服务员即将送达'
    case 'DONE': return '已送达，订单完成'
    case 'CLOSED': return who === '您' ? '您取消了订单' : '订单超时未支付，已关闭'
    case 'CANCELLED': return who === '您' ? '您取消了订单，款项将原路退回' : who === '商家' ? '商家取消了订单，款项将原路退回' : '系统取消了订单，款项将原路退回'
    default: return '订单状态更新'
  }
}
