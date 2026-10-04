import { ApiError } from './request'

/**
 * 页面错误处理约定（谁负责提示）：
 * - 用户点击的操作：请求层负责弹出错误提示；页面在 catch 里调用本函数，只负责恢复按钮 / 保留输入
 * - 页面首次加载：页面自己展示错误状态和重试入口
 * - 后台轮询：请求带 silent，不弹提示；页面展示数据是否过期 / 连接状态
 *
 * 只吞掉请求层已处理过的 ApiError；其他异常（代码缺陷）继续抛出，不会被静默掉。
 */
export function ignoreShownError(e: unknown): void {
  if (!(e instanceof ApiError)) {
    throw e
  }
}
