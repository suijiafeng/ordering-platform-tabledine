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

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
