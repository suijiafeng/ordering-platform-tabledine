import { Tag } from 'antd'
import type { OrderRefundStatus, OrderStatus, RefundStatus } from '../api/types'
import { ORDER_REFUND_STATUS, ORDER_STATUS, ORDER_STATUS_WAIT_COOK, REFUND_STATUS } from '../utils/orderStatus'

/**
 * 订单状态标签。传入 cookingStartedAt 时细分后厨进度：已接单（MAKING）但后厨尚未开始 → 「待制作」，开始后 → 「制作中」。
 * cookingStartedAt 为 undefined（旧版后端没有该字段）时按原样显示「制作中」。
 */
export function OrderStatusTag({ status, cookingStartedAt }: { status: OrderStatus; cookingStartedAt?: string | null }) {
  const s = status === 'MAKING' && cookingStartedAt === null
    ? ORDER_STATUS_WAIT_COOK
    : ORDER_STATUS[status] ?? { label: status, color: 'default' }
  return <Tag color={s.color}>{s.label}</Tag>
}

export function OrderRefundTag({ status }: { status: OrderRefundStatus }) {
  if (status === 'NONE') {
    return null
  }
  const s = ORDER_REFUND_STATUS[status]
  return <Tag color={s.color}>{s.label}</Tag>
}

export function RefundStatusTag({ status }: { status: RefundStatus }) {
  const s = REFUND_STATUS[status] ?? { label: status, color: 'default' }
  return <Tag color={s.color}>{s.label}</Tag>
}
