import { request } from '../utils/request'
import type { MerchantRefundRequest, NewOrderCount, OrderDetail, OrderSummary, PageResult, RefundView, OfflinePayMethod, PlaceOrderItem, PayMode } from './types'

export interface OrderListParams {
  status?: string
  keyword?: string
  date?: string
  /** APPLYING：只看顾客申请取消、待处理的订单 */
  cancelRequest?: 'APPLYING'
  /** 只看先吃后付、还没结账的订单 */
  unsettled?: boolean
  page: number
  pageSize: number
}

export const listOrders = (params: OrderListParams) =>
  request<PageResult<OrderSummary>>({ url: '/api/v1/m/orders', params })

/** 同意顾客的取消申请：订单取消并全额退回余额 */
export const approveCancelRequest = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/cancel-request/approve`, method: 'POST' })

/** 拒绝顾客的取消申请：订单继续制作，理由顾客可见 */
export const rejectCancelRequest = (orderNo: string, reason: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/cancel-request/reject`, method: 'POST', data: { reason } })

export const kitchenQueue = () => request<OrderSummary[]>({ url: '/api/v1/m/orders/kitchen', silent: true })

export const newOrderCount = (since: string | null) =>
  request<NewOrderCount>({ url: '/api/v1/m/orders/new-count', params: since ? { since } : undefined, silent: true })

export const getOrder = (orderNo: string) => request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}` })

export const acceptOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/accept`, method: 'POST' })

export const rejectOrder = (orderNo: string, reason: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/reject`, method: 'POST', data: { reason } })

/** 后厨开始制作：待制作 → 制作中（订单状态仍是 MAKING） */
export const startCooking = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/start`, method: 'POST' })

export const readyOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/ready`, method: 'POST' })

export const deliverOrder = (orderNo: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/deliver`, method: 'POST' })

export const cancelOrder = (orderNo: string, reason: string) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/cancel`, method: 'POST', data: { reason } })

export const refundOrder = (orderNo: string, data: MerchantRefundRequest) =>
  request<RefundView>({ url: `/api/v1/m/orders/${orderNo}/refunds`, method: 'POST', data })

/** 前厅代客下单 + 登记线下收款：直接进入待制作；clientRequestId 防重复提交 */
export const placeOrder = (data: { clientRequestId: string; tableId: number; items: PlaceOrderItem[]; peopleCount: number; remark?: string; payMode: PayMode; payMethod?: OfflinePayMethod; payRemark?: string }) =>
  request<OrderDetail>({ url: '/api/v1/m/orders', method: 'POST', data })

/** 先吃后付结账：登记线下收款，订单此刻入账 */
export const settleOrder = (orderNo: string, data: { payMethod: OfflinePayMethod; payRemark?: string }) =>
  request<OrderDetail>({ url: `/api/v1/m/orders/${orderNo}/settle`, method: 'POST', data })
