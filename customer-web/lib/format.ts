import type { OrderStatus, RefundStatus } from './types'

/** 金额（分）转元；整数不带 .00 */
export const yuan = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '')

const pad = (n: number) => String(n).padStart(2, '0')

/** 列表 / 详情用的时间：MM-DD HH:mm */
export function dateTime(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 状态时间线用：同一分钟内可能发生多次流转，带上秒 */
export function dateTimeWithSeconds(value?: string | null): string {
  if (!value) return ''
  return `${dateTime(value)}:${pad(new Date(value).getSeconds())}`
}

/** 剩余秒数转 mm:ss */
export function countdownText(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

// 文案与小程序 utils/order.ts 保持一致
const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  PENDING_PAY: '待支付',
  PAID: '待商家接单',
  MAKING: '制作中',
  READY: '已出餐，即将送达',
  DONE: '已完成',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
}

const REFUND_STATUS_TEXT: Record<RefundStatus, string> = {
  APPLYING: '待商家审核',
  PROCESSING: '退款中',
  SUCCESS: '已退款',
  FAILED: '退款失败，商家处理中',
  REJECTED: '商家已拒绝',
  WITHDRAWN: '已撤回',
  OFFLINE: '已线下退款',
}

/** 后端可能先于前端新增状态：未知状态给兜底文案，不显示 undefined */
export const orderStatusText = (status: string) => (ORDER_STATUS_TEXT as Record<string, string>)[status] ?? '处理中'
export const refundStatusText = (status: string) => (REFUND_STATUS_TEXT as Record<string, string>)[status] ?? '处理中'

/** 状态时间线每一步的文案。顾客看不到员工姓名，只区分「商家 / 系统 / 本人」 */
export function statusLogText(toStatus: string, operatorType: string | null): string {
  const who = operatorType === 'MERCHANT' ? '商家' : operatorType === 'CUSTOMER' ? '您' : '系统'
  switch (toStatus) {
    case 'PENDING_PAY': return '订单已提交，等待支付'
    case 'PAID': return '支付成功，等待商家接单'
    case 'MAKING': return who === '系统' ? '已自动接单，开始制作' : '商家已接单，开始制作'
    case 'READY': return '已出餐，服务员即将送达'
    case 'DONE': return '已送达，订单完成'
    case 'CLOSED': return who === '您' ? '您取消了订单' : '订单超时未支付，已关闭'
    case 'CANCELLED': return `${who === '您' ? '您' : who}取消了订单，款项将退回账户余额`
    default: return '订单状态更新'
  }
}

export const itemOptionsText = (item: { specDesc?: string | null; addonDesc?: string | null }) =>
  [item.specDesc, item.addonDesc].filter(Boolean).join(' · ')

export function imageSrc(path: string | null) {
  if (!path) return ''
  return /^https?:\/\//.test(path) ? path : path.startsWith('/') ? path : `/${path}`
}
