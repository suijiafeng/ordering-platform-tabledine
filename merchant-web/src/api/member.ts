import { request } from '../utils/request'
import type { MemberItem, PageResult, WalletTransaction } from './types'

export const listMembers = (params: { keyword?: string; page: number; pageSize: number }) =>
  request<PageResult<MemberItem>>({ url: '/api/v1/m/members', params })

/** initialAmount：开户时顺带充值（分） */
export const createMember = (data: { phone: string; name: string; password: string; initialAmount?: number }) =>
  request<MemberItem>({ url: '/api/v1/m/members', method: 'POST', data })

/** password 非空时重置密码（该会员需重新登录） */
export const updateMember = (id: number, data: { name?: string; password?: string }) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}`, method: 'PUT', data })

export const setMemberEnabled = (id: number, enabled: boolean) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}/status`, method: 'PATCH', data: { enabled } })

/** amount 单位：分 */
/** requestId：每次打开充值窗口生成一个，超时重试 / 重复点击只入账一次 */
export const rechargeMember = (id: number, data: { amount: number; remark?: string; requestId: string }) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}/recharge`, method: 'POST', data })

export const listMemberTransactions = (id: number, params: { page: number; pageSize: number }) =>
  request<PageResult<WalletTransaction>>({ url: `/api/v1/m/members/${id}/transactions`, params })
