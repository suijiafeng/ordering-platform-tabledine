import { request } from '../utils/request'
import type { CustomerProfile, QrResolveView } from './types'

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
