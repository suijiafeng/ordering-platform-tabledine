import { ApiError } from './apiError'

/**
 * 页面错误处理约定（谁负责提示）：
 * - 用户点击的操作：请求层负责 Toast 提示；页面在 catch 里调用本函数，只负责恢复按钮 / 保留输入
 * - 页面首次加载：页面自己展示错误状态和重试入口
 * - 后台轮询：请求带 silent，不弹提示；页面展示加载失败 / 重试中
 *
 * 只吞掉请求层已处理过的 ApiError；其他异常（代码缺陷）继续抛出，不会被静默掉。
 */
export function ignoreShownError(e: unknown): void {
  if (!(e instanceof ApiError)) {
    throw e
  }
}

/** 尚未了结的退款：待审核、处理中、失败（失败后商家仍需重试或线下退款）。与后端 RefundStatus.isUnresolved 一致 */
export function isRefundUnresolved(status: string): boolean {
  return status === 'APPLYING' || status === 'PROCESSING' || status === 'FAILED'
}
