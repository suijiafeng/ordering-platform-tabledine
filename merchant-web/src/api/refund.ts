import { request } from '../utils/request'
import type { PageResult, RefundView } from './types'

export const listRefunds = (params: { status?: string; page: number; pageSize: number }) =>
  request<PageResult<RefundView>>({ url: '/api/v1/m/refunds', params })

export const getRefund = (refundNo: string) => request<RefundView>({ url: `/api/v1/m/refunds/${refundNo}` })

export const approveRefund = (refundNo: string) =>
  request<RefundView>({ url: `/api/v1/m/refunds/${refundNo}/approve`, method: 'POST' })

export const rejectRefund = (refundNo: string, reason: string) =>
  request<RefundView>({ url: `/api/v1/m/refunds/${refundNo}/reject`, method: 'POST', data: { reason } })

export const retryRefund = (refundNo: string) =>
  request<RefundView>({ url: `/api/v1/m/refunds/${refundNo}/retry`, method: 'POST' })

export const offlineRefund = (refundNo: string, remark: string) =>
  request<RefundView>({ url: `/api/v1/m/refunds/${refundNo}/offline`, method: 'POST', data: { remark } })
