import { request } from '../utils/request'
import type { OrderDetail, OrderSummary, PageResult, PayInitResult, RefundView } from './types'

export interface CreateOrderPayload {
  clientRequestId: string
  qrToken: string
  items: { dishId: number; specItemIds: number[]; addonItemIds: number[]; quantity: number }[]
  peopleCount: number
  remark?: string
}

export const createOrder = (data: CreateOrderPayload) =>
  request<OrderDetail>({ url: '/api/v1/c/orders', method: 'POST', data })

export const initPay = (orderNo: string) =>
  request<PayInitResult>({ url: `/api/v1/c/orders/${orderNo}/pay`, method: 'POST' })

export const mockPay = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/c/orders/${orderNo}/mock-pay`, method: 'POST' })

export const fetchOrder = (orderNo: string, silent = false) =>
  request<OrderDetail>({ url: `/api/v1/c/orders/${orderNo}`, silent })

export const fetchOrders = (page: number, pageSize = 20) =>
  request<PageResult<OrderSummary>>({ url: `/api/v1/c/orders?page=${page}&pageSize=${pageSize}` })

export const cancelOrder = (orderNo: string, reason?: string) =>
  request<OrderDetail>({ url: `/api/v1/c/orders/${orderNo}/cancel`, method: 'POST', data: { reason } })

/** items 为空 = 整单退款（退全部可退余额） */
export const applyRefund = (orderNo: string, reason: string, items: { orderItemId: number; quantity: number }[] = []) =>
  request<RefundView>({ url: `/api/v1/c/orders/${orderNo}/refunds`, method: 'POST', data: { reason, items } })

export const withdrawRefund = (refundNo: string) =>
  request<RefundView>({ url: `/api/v1/c/refunds/${refundNo}/withdraw`, method: 'POST' })
