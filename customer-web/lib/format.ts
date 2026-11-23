import type { OrderStatus, RefundStatus } from './types'

/** 金额（分）转元；整数不带 .00 */
export const yuan = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '')

const pad = (n: number) => String(n).padStart(2, '0')

/** 门店所在时区：订单时间按门店墙钟显示，与顾客手机的时区设置无关 */
export const STORE_TZ = 'Asia/Shanghai'

const storeParts = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** 把时间拆成门店时区的年月日时分秒（都是两位数字字符串，年份四位） */
function inStore(d: Date) {
  const m: Record<string, string> = {}
  for (const p of storeParts.formatToParts(d)) m[p.type] = p.value
  return m as { year: string; month: string; day: string; hour: string; minute: string; second: string }
}

/** 列表 / 详情用的时间：MM-DD HH:mm；不是今年的订单带上年份，避免跨年后混淆 */
export function dateTime(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = inStore(d)
  const year = p.year === inStore(new Date()).year ? '' : `${p.year}-`
  return `${year}${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** 状态时间线用：同一分钟内可能发生多次流转，带上秒 */
export function dateTimeWithSeconds(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${dateTime(value)}:${inStore(d).second}`
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

/**
 * 顾客看到的状态：商家接单后（MAKING）后厨还没开工时显示「已接单」，开工后才是「制作中」。
 * cookingStartedAt 为 undefined（旧版后端）时按原状态显示。
 */
export function displayStatus(status: string, cookingStartedAt?: string | null): string {
  return status === 'MAKING' && cookingStartedAt === null ? 'ACCEPTED' : status
}

const ACCEPTED_TEXT = '商家已接单'
const ACCEPTED_DESC = '后厨马上开始制作；开始制作前如不想要了，可以申请取消'

/** 状态卡片下的一句说明，告诉顾客接下来会发生什么 */
const ORDER_STATUS_DESC: Record<OrderStatus, string> = {
  PENDING_PAY: '',
  PAID: '商家接单后开始制作，请留意订单进度',
  MAKING: '后厨正在制作，请稍候',
  READY: '菜品已做好，服务员马上送到桌上',
  DONE: '感谢光临，欢迎再来',
  CLOSED: '订单未支付已关闭，可以重新点餐',
  CANCELLED: '已取消，金额已退回余额',
}
export const orderStatusDesc = (status: string, cookingStartedAt?: string | null) => {
  const s = displayStatus(status, cookingStartedAt)
  return s === 'ACCEPTED' ? ACCEPTED_DESC : (ORDER_STATUS_DESC as Record<string, string>)[s] ?? ''
}

/** 后端可能先于前端新增状态：未知状态给兜底文案，不显示 undefined */
export const orderStatusText = (status: string, cookingStartedAt?: string | null) => {
  const s = displayStatus(status, cookingStartedAt)
  return s === 'ACCEPTED' ? ACCEPTED_TEXT : (ORDER_STATUS_TEXT as Record<string, string>)[s] ?? '处理中'
}
export const refundStatusText = (status: string) => (REFUND_STATUS_TEXT as Record<string, string>)[status] ?? '处理中'

/** 状态时间线每一步的文案。顾客看不到员工姓名，只区分「商家 / 系统 / 本人」 */
export function statusLogText(toStatus: string, operatorType: string | null): string {
  const who = operatorType === 'MERCHANT' ? '商家' : operatorType === 'CUSTOMER' ? '您' : '系统'
  switch (toStatus) {
    case 'PENDING_PAY': return '订单已提交，等待支付'
    case 'PAID': return '支付成功，等待商家接单'
    case 'MAKING': return who === '系统' ? '已自动接单' : '商家已接单'
    case 'READY': return '已出餐，服务员即将送达'
    case 'DONE': return '已送达，订单完成'
    case 'CLOSED': return who === '您' ? '您取消了订单' : '订单超时未支付，已关闭'
    case 'CANCELLED': return `${who === '您' ? '您' : who}取消了订单，金额会退回余额`
    default: return '订单状态更新'
  }
}

export const itemOptionsText = (item: { specDesc?: string | null; addonDesc?: string | null }) =>
  [item.specDesc, item.addonDesc].filter(Boolean).join(' · ')

/** 无图菜品的占位字：取名称第一个字 */
export const initialOf = (name: string) => (name.trim().charAt(0) || '菜')

export function imageSrc(path: string | null) {
  if (!path) return ''
  return /^https?:\/\//.test(path) ? path : path.startsWith('/') ? path : `/${path}`
}

/** 确认支付弹窗的说明：一句话，余额已知时带上支付后余额 */
export const payNote = (balance: number | null, amount: number) =>
  balance !== null ? `余额支付，支付后剩余 ¥${yuan(balance - amount)}` : '使用会员余额支付'


/** 11 位手机号中间四位打码，用于已登录提示 */
export function maskPhone(phone?: string | null) {
  if (!phone) return ''
  const digits = phone.replace(/\s/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}****${digits.slice(7)}`
  return phone
}

/** 进度节点用的当天时刻 HH:mm */
export function clockTime(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = inStore(d)
  return `${p.hour}:${p.minute}`
}
