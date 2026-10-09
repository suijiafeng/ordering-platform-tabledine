import { request } from '../utils/request'
import type { MemberItem, PageResult, WalletTransaction } from './types'

export const listMembers = (params: { keyword?: string; page: number; pageSize: number }) =>
  request<PageResult<MemberItem>>({ url: '/api/v1/m/members', params })

/** initialAmount：开户时顺带充值（分） */
/** 有首充（initialAmount > 0）时必须带 operatorPassword：当前登录员工的密码，服务端复核操作人身份 */
export const createMember = (data: { phone: string; name: string; password: string; initialAmount?: number; operatorPassword?: string }, opts?: { silent?: boolean }) =>
  request<MemberItem>({ url: '/api/v1/m/members', method: 'POST', data, silent: opts?.silent })

/** 单个会员（手机号脱敏） */
export const getMember = (id: number) => request<MemberItem>({ url: `/api/v1/m/members/${id}` })

/** password 非空时重置密码（仅店主，须带 operatorPassword 复核当前登录密码；该会员需重新登录） */
export const updateMember = (id: number, data: { name?: string; password?: string; operatorPassword?: string }, opts?: { silent?: boolean }) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}`, method: 'PUT', data, silent: opts?.silent })

export const setMemberEnabled = (id: number, enabled: boolean) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}/status`, method: 'PATCH', data: { enabled } })

/** amount 单位：分 */
/** requestId：同一会员同一金额的一笔充值共用一个（超时重试 / 重复点击只入账一次）；服务端拒绝同一请求号换金额 */
/** operatorPassword：当前登录员工的密码，充值前复核操作人身份（错误返回 40302） */
export const rechargeMember = (id: number, data: { amount: number; remark?: string; requestId: string; operatorPassword: string }, opts?: { silent?: boolean }) =>
  request<MemberItem>({ url: `/api/v1/m/members/${id}/recharge`, method: 'POST', data, silent: opts?.silent })

export const listMemberTransactions = (id: number, params: { page: number; pageSize: number }) =>
  request<PageResult<WalletTransaction>>({ url: `/api/v1/m/members/${id}/transactions`, params })
