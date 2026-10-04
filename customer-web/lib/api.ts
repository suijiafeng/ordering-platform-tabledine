'use client'

import { getToken, logout, saveToken } from './auth'
import { currentRoutePath, toBrowserUrl } from './navigation'
import type {
  CustomerProfile, MenuView, OrderDetail, OrderSummary, PageResult, PayInitResult, RefundRecord, TableInfo, WalletTransaction,
} from './types'
import { notify } from '@/store/feedback'

interface Envelope<T> { code: number; message: string; data: T }

/** 后端统一错误：code 为业务码（-1 表示网络 / 未知），status 为 HTTP 状态 */
export class ApiError extends Error {
  constructor(public code: number, message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends RequestInit {
  /** 是否携带会员 token，默认 true；未登录时跳转登录页 */
  auth?: boolean
  /** 出错时不弹提示，由调用方自行展示（如首屏加载失败页） */
  silent?: boolean
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * 统一请求封装：
 * - 注入会员 token；未登录或 401 / 40101（过期、停用、改密）时清除 token 并跳转登录页，登录后回到当前页
 * - code !== 0：默认提示 message 并抛出 ApiError
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, silent = false, ...init } = options
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (auth) {
    const token = getToken()
    if (!token) {
      redirectToLogin()
      throw new ApiError(40101, '请先登录', 401)
    }
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    if (!silent) notify('网络异常，请稍后重试')
    throw new ApiError(-1, '网络异常，请稍后重试', 0)
  }

  const body = await response.json().catch(() => null) as Envelope<T> | null
  // 只有「登录失效」（40101）才退出登录；其他 401（如账号或密码错误）按普通业务错误提示
  if (auth && (body?.code === 40101 || (response.status === 401 && !body))) {
    logout()
    redirectToLogin()
    throw new ApiError(40101, body?.message || '登录已失效', response.status)
  }
  if (!response.ok || !body || body.code !== 0) {
    const message = body?.message || '请求失败，请稍后重试'
    if (!silent) notify(message)
    throw new ApiError(body?.code ?? -1, message, response.status)
  }
  return body.data
}

function redirectToLogin() {
  if (typeof window === 'undefined') return
  const redirect = currentRoutePath()
  if (redirect.startsWith('/login')) return
  location.assign(toBrowserUrl(`/login/?redirect=${encodeURIComponent(redirect)}`))
}

const post = (body: unknown = {}): RequestOptions => ({ method: 'POST', body: JSON.stringify(body) })
const orderPath = (orderNo: string) => `/api/v1/c/orders/${encodeURIComponent(orderNo)}`

export async function passwordLogin(phone: string, password: string) {
  const result = await request<{ token: string; expiresIn: number }>(
    '/api/v1/c/auth/password-login', { ...post({ phone, password }), auth: false },
  )
  saveToken(result.token, result.expiresIn)
}

/** 扫码解析桌台；silent：首屏由调用方展示错误 */
export async function resolveTable(qrToken: string): Promise<TableInfo> {
  const table = await request<Omit<TableInfo, 'qrToken'>>(`/api/v1/c/qr/${encodeURIComponent(qrToken)}`, { auth: false, silent: true })
  return { ...table, qrToken }
}

export const fetchMenu = (storeId: number) =>
  request<MenuView>(`/api/v1/c/stores/${storeId}/menu`, { auth: false, silent: true })

export const fetchMe = () => request<CustomerProfile>('/api/v1/c/me', { silent: true })

export const fetchWallet = (page: number, pageSize = 20) =>
  request<PageResult<WalletTransaction>>(`/api/v1/c/wallet/transactions?page=${page}&pageSize=${pageSize}`)

export const fetchOrders = (page: number, pageSize = 20) =>
  request<PageResult<OrderSummary>>(`/api/v1/c/orders?page=${page}&pageSize=${pageSize}`)

/** silent：轮询时失败不打扰，由页面显示「加载失败」 */
export const fetchOrder = (orderNo: string) => request<OrderDetail>(orderPath(orderNo), { silent: true })

export interface CreateOrderPayload {
  clientRequestId: string
  qrToken: string
  peopleCount: number
  remark?: string
  items: { dishId: number; specItemIds: number[]; addonItemIds: number[]; quantity: number }[]
}

export const createOrder = (payload: CreateOrderPayload) => request<OrderDetail>('/api/v1/c/orders', post(payload))

export const cancelOrder = (orderNo: string) => request<OrderDetail>(`${orderPath(orderNo)}/cancel`, post())

/**
 * 余额支付：服务端在发起支付的同一事务里扣费入账，返回即已支付；余额不足等情况抛 ApiError（已提示）。
 * 返回 false 表示服务端没有走余额支付（不应发生，按未支付处理，让顾客在订单页重试）。
 */
export async function payOrder(orderNo: string): Promise<boolean> {
  const result = await request<PayInitResult>(`${orderPath(orderNo)}/pay`, post())
  return result.params?.paid === true
}

/** items 为空 = 整单退款（退全部可退余额） */
export const applyRefund = (orderNo: string, reason: string, items: { orderItemId: number; quantity: number }[]) =>
  request<RefundRecord>(`${orderPath(orderNo)}/refunds`, post({ reason, items }))

export const withdrawRefund = (refundNo: string) =>
  request<RefundRecord>(`/api/v1/c/refunds/${encodeURIComponent(refundNo)}/withdraw`, post())

export const changePassword = (oldPassword: string, newPassword: string) =>
  request<void>('/api/v1/c/me/password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) })
