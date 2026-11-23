import dayjs from 'dayjs'
import type { OrderSummary, TableItem } from '../../api/types'

/** 已收款且未取消 / 关闭的订单才计入收款（先吃后付未结账的没有 paidAt） */
function counted(o: OrderSummary): boolean {
  return !!o.paidAt && o.status !== 'CLOSED' && o.status !== 'PENDING_PAY'
}

export interface HourPoint {
  hour: number
  /** 当小时实收（分）：支付金额 − 已退金额 */
  amount: number
  orders: number
}

/**
 * 今日 / 昨日按小时的实收：用订单列表接口（按下单日期）拉当天订单，再按支付时间所在小时汇总。
 * 口径与「今日实收」接近（退款按订单扣减，不按退款日期）；跨零点支付的订单极少，忽略。
 */
export function hourlySeries(orders: OrderSummary[], fromHour: number, toHour: number): HourPoint[] {
  const points: HourPoint[] = []
  for (let h = fromHour; h <= toHour; h++) points.push({ hour: h, amount: 0, orders: 0 })
  for (const o of orders) {
    if (!counted(o)) continue
    const h = dayjs(o.paidAt).hour()
    const p = points.find((x) => x.hour === h)
    if (!p) continue
    p.amount += o.payAmount - o.refundedAmount
    p.orders += 1
  }
  return points
}

/** 图表的小时范围：营业时间（如 10:00-22:00），解析失败时按有数据的小时、至少 10–21 点 */
export function chartHours(businessHours: string | null | undefined, orders: OrderSummary[]): [number, number] {
  const m = businessHours?.match(/(\d{1,2}):\d{2}\s*-\s*(\d{1,2}):(\d{2})/)
  let from = 10
  let to = 21
  if (m) {
    from = Number(m[1])
    // 22:00 打烊 → 最后一个小时段是 21 点；22:30 打烊 → 22 点
    to = Number(m[3]) > 0 ? Number(m[2]) : Number(m[2]) - 1
    if (to < from) to = 23 // 跨零点营业，只画到当天 23 点
  }
  for (const o of orders) {
    if (!o.paidAt) continue
    const h = dayjs(o.paidAt).hour()
    from = Math.min(from, h)
    to = Math.max(to, h)
  }
  return [from, Math.min(to, 23)]
}

export interface PrepStats {
  served: number
  /** 平均出餐分钟（开始制作或接单 → 出餐），没有数据为 null */
  avgMinutes: number | null
  fast: number
  normal: number
  slow: number
}

/** 今日出餐用时分布：≤10 分钟 / 10–15 分钟 / 超过 15 分钟（超时） */
export function prepStats(orders: OrderSummary[]): PrepStats {
  const minutes: number[] = []
  for (const o of orders) {
    const start = o.cookingStartedAt ?? o.acceptedAt
    if (!o.readyAt || !start) continue
    minutes.push(Math.max(0, dayjs(o.readyAt).diff(dayjs(start), 'second') / 60))
  }
  const fast = minutes.filter((m) => m <= 10).length
  const slow = minutes.filter((m) => m > 15).length
  return {
    served: minutes.length,
    avgMinutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : null,
    fast,
    normal: minutes.length - fast - slow,
    slow,
  }
}

export type TableState = 'PENDING' | 'DINING' | 'IDLE'

/** 桌台状态：有待接单 → 待接单；有制作中 / 待送餐 / 先吃后付未结账 → 用餐中；否则空闲 */
export function tableStates(tables: TableItem[], active: OrderSummary[]): { code: string; state: TableState; amount: number }[] {
  return tables
    .filter((t) => t.status === 1)
    .map((t) => {
      const mine = active.filter((o) => o.tableCode === t.code)
      const state: TableState = mine.some((o) => o.status === 'PAID')
        ? 'PENDING'
        : mine.some((o) => o.status === 'MAKING' || o.status === 'READY' || (o.payMode === 'PAY_LATER' && !o.paidAt && o.status === 'DONE'))
          ? 'DINING'
          : 'IDLE'
      return { code: t.code, state, amount: mine.reduce((s, o) => s + o.payAmount, 0) }
    })
}

/** 环比：今天 vs 昨天，昨天为 0 时不显示 */
export function changeRate(today: number, yesterday: number): number | null {
  if (!yesterday) return null
  return (today - yesterday) / yesterday
}

export function greeting(hour: number): string {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
