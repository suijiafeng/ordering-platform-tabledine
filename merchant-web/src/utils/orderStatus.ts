import type { OrderRefundStatus, OrderStatus, Platform, RefundInitiator, RefundStatus, RefundType } from '../api/types'

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  PENDING_PAY: { label: '待支付', color: 'default' },
  PAID: { label: '待接单', color: 'orange' },
  MAKING: { label: '制作中', color: 'processing' },
  READY: { label: '待送餐', color: 'cyan' },
  DONE: { label: '已完成', color: 'green' },
  CLOSED: { label: '已关闭', color: 'default' },
  CANCELLED: { label: '已取消', color: 'red' },
}

export const ORDER_REFUND_STATUS: Record<OrderRefundStatus, { label: string; color: string }> = {
  NONE: { label: '无退款', color: 'default' },
  PARTIAL: { label: '部分退款', color: 'gold' },
  FULL: { label: '全额退款', color: 'red' },
}

export const REFUND_STATUS: Record<RefundStatus, { label: string; color: string }> = {
  APPLYING: { label: '待审核', color: 'orange' },
  PROCESSING: { label: '处理中', color: 'processing' },
  SUCCESS: { label: '退款成功', color: 'green' },
  FAILED: { label: '退款失败', color: 'red' },
  REJECTED: { label: '已拒绝', color: 'default' },
  WITHDRAWN: { label: '已撤回', color: 'default' },
  OFFLINE: { label: '线下退款', color: 'purple' },
}

export const REFUND_TYPE: Record<RefundType, string> = { FULL: '整单', ITEM: '按菜品', CUSTOM: '自定义金额' }
export const REFUND_INITIATOR: Record<RefundInitiator, string> = { CUSTOMER: '顾客申请', MERCHANT: '商家发起', SYSTEM: '系统自动' }
export const PLATFORM: Record<Platform, string> = { WECHAT: '微信', ALIPAY: '支付宝' }

export const OPERATOR_TYPE = { CUSTOMER: '顾客', MERCHANT: '商家', SYSTEM: '系统', PAY_CHANNEL: '支付渠道' } as const

/** 尚未了结的退款：待审核、处理中、失败（失败后仍需重试或线下退款）。与后端 RefundStatus.isUnresolved 一致 */
export function isRefundUnresolved(status: string): boolean {
  return status === 'APPLYING' || status === 'PROCESSING' || status === 'FAILED'
}
