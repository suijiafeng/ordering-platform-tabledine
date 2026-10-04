import { Tag } from 'antd'
import type { OrderRefundStatus, OrderStatus, RefundStatus } from '../api/types'
import { ORDER_REFUND_STATUS, ORDER_STATUS, REFUND_STATUS } from '../utils/orderStatus'

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status] ?? { label: status, color: 'default' }
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
