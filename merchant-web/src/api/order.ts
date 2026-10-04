import { request } from '../utils/request'
import type { MerchantRefundRequest, NewOrderCount, OrderDetail, OrderSummary, PageResult, RefundView } from './types'

export interface OrderListParams {
  status?: string
  keyword?: string
  date?: string
  page: number
  pageSize: number
}

export const listOrders = (params: OrderListParams) =>
  request<PageResult<OrderSummary>>({ url: '/api/v1/m/orders', params })

export const kitchenQueue = () => request<OrderSummary[]>({ url: '/api/v1/m/orders/kitchen', silent: true })

export const newOrderCount = (since: string | null) =>
  request<NewOrderCount>({ url: '/api/v1/m/orders/new-count', params: since ? { since } : undefined, silent: true })

export const getOrder = (orderNo: string) => request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}` })

export const acceptOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/accept`, method: 'POST' })

export const rejectOrder = (orderNo: string, reason: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/reject`, method: 'POST', data: { reason } })

export const readyOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/ready`, method: 'POST' })

export const deliverOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/deliver`, method: 'POST' })

export const cancelOrder = (orderNo: string, reason: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/cancel`, method: 'POST', data: { reason } })

export const refundOrder = (orderNo: string, data: MerchantRefundRequest) =>
  request<RefundView>({ url: `/api/v1/m/orders/${orderNo}/refunds`, method: 'POST', data })
