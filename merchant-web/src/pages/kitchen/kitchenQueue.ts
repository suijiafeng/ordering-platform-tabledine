import dayjs, { type Dayjs } from 'dayjs'
import type { OrderSummary } from '../../api/types'

/**
 * 后厨看板的三个阶段（只看前厅已确认的订单）：
 * 待制作（尚未点开始）→ 制作中（已点开始制作）→ 待取餐（已出餐，等前厅取走）
 */
export type KitchenStage = 'TODO' | 'COOKING' | 'DONE'

export function stageOf(o: OrderSummary): KitchenStage {
  if (o.status === 'READY') return 'DONE'
  return o.cookingStartedAt ? 'COOKING' : 'TODO'
}

/** 各阶段的计时起点与超时阈值（分钟）：接单后 5 分钟没开始做、开始后 20 分钟没做完、做好 5 分钟没被取走，都高亮 */
export const STAGE_META: Record<KitchenStage, { label: string; since: (o: OrderSummary) => string | null; overdueMin: number; sinceText: string }> = {
  TODO: { label: '待制作', since: (o) => o.acceptedAt, overdueMin: 5, sinceText: '已等待' },
  COOKING: { label: '制作中', since: (o) => o.cookingStartedAt ?? o.acceptedAt, overdueMin: 20, sinceText: '已制作' },
  DONE: { label: '待取餐', since: (o) => o.readyAt, overdueMin: 5, sinceText: '已等待' },
}

export function minutesSince(from: string | null, now: Dayjs = dayjs()): number {
  return from ? now.diff(dayjs(from), 'minute') : 0
}

export function isOverdue(o: OrderSummary, now: Dayjs = dayjs()): boolean {
  const meta = STAGE_META[stageOf(o)]
  return minutesSince(meta.since(o), now) >= meta.overdueMin
}

function stageEnteredAt(o: OrderSummary): string {
  return STAGE_META[stageOf(o)].since(o) ?? o.createdAt
}

function byTimeAsc(a: OrderSummary, b: OrderSummary): number {
  const byTime = stageEnteredAt(a).localeCompare(stageEnteredAt(b))
  return byTime !== 0 ? byTime : a.orderNo.localeCompare(b.orderNo)
}

/**
 * 同一栏内的排序规则（避免超时旧票压在新票的大按钮上面、导致误点）：
 * 1. 未超时的票在前，已超时的票单独排在后面（界面上用「已超时」分区隔开，并保留红框标记）
 * 2. 两组内部都按进入本阶段的时间从早到晚（先来先做）；时间相同则按订单号
 */
export function splitKitchenColumn(list: OrderSummary[], now: Dayjs = dayjs()): { current: OrderSummary[]; overdue: OrderSummary[] } {
  const current: OrderSummary[] = []
  const overdue: OrderSummary[] = []
  for (const o of list) {
    (isOverdue(o, now) ? overdue : current).push(o)
  }
  current.sort(byTimeAsc)
  overdue.sort(byTimeAsc)
  return { current, overdue }
}

export function sortKitchenColumn(list: OrderSummary[], now: Dayjs = dayjs()): OrderSummary[] {
  const { current, overdue } = splitKitchenColumn(list, now)
  return [...current, ...overdue]
}
