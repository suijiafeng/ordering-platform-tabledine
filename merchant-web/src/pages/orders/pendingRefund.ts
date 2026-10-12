import type { MerchantRefundRequest } from '../../api/types'

export interface PendingRefund {
  orderNo: string
  request: MerchantRefundRequest
  amountInCents: number
}

const storageKey = (orderNo: string) => `merchant-pending-refund:${orderNo}`

/** 先保存再发送；页面关闭、重新打开或刷新后仍使用同一编号和原始内容。 */
export function savePendingRefund(pending: PendingRefund): void {
  sessionStorage.setItem(storageKey(pending.orderNo), JSON.stringify(pending))
}

export function loadPendingRefund(orderNo: string): PendingRefund | null {
  const raw = sessionStorage.getItem(storageKey(orderNo))
  if (!raw) return null
  const pending = JSON.parse(raw) as Partial<PendingRefund> | null
  const request = pending?.request
  if (pending?.orderNo !== orderNo || !request
    || typeof request.clientRequestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(request.clientRequestId)
    || !['FULL', 'ITEM', 'CUSTOM'].includes(request.type)
    || typeof request.reason !== 'string' || !request.reason.trim()
    || !Number.isSafeInteger(pending.amountInCents) || (pending.amountInCents ?? 0) <= 0
    || (request.type === 'CUSTOM' && request.amount !== pending.amountInCents)
    || (request.items !== undefined && (!Array.isArray(request.items) || request.items.some((item) => !item
      || !Number.isSafeInteger(item.orderItemId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1)))) {
    // 不能把损坏的恢复记录当作「从未提交」，否则可能用新编号重复退款。
    throw new Error('退款恢复记录无效，请先在退款管理中核对原退款')
  }
  return pending as PendingRefund
}

/** 旧请求的迟到响应不能清除后来创建的退款；清理失败也保留原编号，下一次仍安全查询原单。 */
export function clearPendingRefund(pending: PendingRefund): void {
  try {
    const saved = loadPendingRefund(pending.orderNo)
    if (saved?.request.clientRequestId === pending.request.clientRequestId) {
      sessionStorage.removeItem(storageKey(pending.orderNo))
    }
  } catch {
    // 保留原记录最多导致再次确认同一退款，不会把已成功的退款当成新请求。
  }
}
