/** 后端统一错误：code 为业务码（-1 表示网络 / 未知），statusCode 为 HTTP 状态 */
export class ApiError extends Error {
  constructor(public code: number, message: string, public statusCode?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export const UNAUTHORIZED = 40101
export const NOT_FOUND = 40401

/**
 * 把小程序 request 的失败回调转换成「带 HTTP 状态的响应」。
 * 微信：任何 HTTP 状态都走 success；支付宝：非 2xx 走 fail（error=19），但 status / data 仍在错误对象上。
 * 后端所有业务错误都带真实 HTTP 状态（401 / 404 / 409 / 422 / 429），不转换的话在支付宝端
 * 401 永远不会触发重新登录，「已售罄 / 已打烊 / 已超时」全部变成「网络异常」。
 */
export function httpErrorToResponse<T>(e: unknown): { statusCode: number; data: T } | null {
  const err = e as { status?: number; statusCode?: number; data?: unknown }
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : undefined
  if (!status || err.data === undefined) return null
  let data = err.data as unknown
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  return { statusCode: status, data: data as T }
}
