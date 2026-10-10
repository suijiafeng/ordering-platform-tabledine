import { ApiError } from './api'

export const UNAUTHORIZED = 40101
export const NOT_FOUND = 40401

/**
 * 请求层已经提示过的业务 / 网络错误（ApiError）可以忽略；其他异常是代码缺陷，继续抛出。
 * 用法：catch (e) { ignoreShownError(e) // 说明页面自己负责恢复什么 }
 */
export function ignoreShownError(e: unknown): void {
  if (!(e instanceof ApiError)) throw e
}

/** 未了结的退款：待审核、处理中、失败待商家处理。与后端 RefundStatus.isUnresolved 一致 */
export function isRefundUnresolved(status: string): boolean {
  return status === 'APPLYING' || status === 'PROCESSING' || status === 'FAILED'
}
