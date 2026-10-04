import { request } from '../utils/request'
import type { CustomerProfile, PageResult, QrResolveView, WalletTransaction } from './types'

/** 扫码解析：返回店铺 + 桌台 */
export function resolveQr(qrToken: string, silent = false) {
  return request<QrResolveView>({
    url: `/api/v1/c/qr/${encodeURIComponent(qrToken)}`,
    auth: false,
    silent,
  })
}

/** 当前顾客信息（用于验证登录闭环） */
export function fetchMe() {
  return request<CustomerProfile>({ url: '/api/v1/c/me', silent: true })
}

/** 我的余额流水（H5 会员） */
export const fetchWalletTransactions = (page = 1, pageSize = 20) =>
  request<PageResult<WalletTransaction>>({ url: `/api/v1/c/wallet/transactions?page=${page}&pageSize=${pageSize}` })

/** 会员修改密码：成功后旧 token 失效，需要重新登录 */
export const changePassword = (oldPassword: string, newPassword: string) =>
  request<void>({ url: '/api/v1/c/me/password', method: 'PUT', data: { oldPassword, newPassword } })
