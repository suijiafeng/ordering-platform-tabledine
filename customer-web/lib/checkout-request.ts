import type { CreateOrderPayload } from './api'
import type { CartItem } from './types'

export const CHECKOUT_REQUEST_KEY = 'ordering_checkout_request_id'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
export type CheckoutPayload = Omit<CreateOrderPayload, 'clientRequestId'>

export class CheckoutStorageError extends Error {}

/** 保存原始请求，而非只保存随购物车变化的指纹。旧版记录仍可只读查询。 */
export interface PendingCheckout {
  id: string
  fingerprint: string
  customerId?: number
  payload?: CreateOrderPayload
  items?: CartItem[]
  tableCode?: string
  total?: number
}

export function checkoutPayload(qrToken: string, peopleCount: number, remark: string, items: CartItem[]): CheckoutPayload {
  return {
    qrToken, peopleCount, remark: remark.trim() || undefined,
    items: items.map(item => ({
      dishId: item.dishId, specItemIds: [...item.specItemIds], addonItemIds: [...item.addonItemIds], quantity: item.quantity,
    })),
  }
}

export function readPendingCheckout(storage: Storage): PendingCheckout | null {
  try {
    const raw = storage.getItem(CHECKOUT_REQUEST_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as PendingCheckout
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.fingerprint !== 'string'
      || (value.payload && value.payload.clientRequestId !== value.id)) throw new Error('invalid checkout record')
    return value
  } catch {
    // 无法读取原编号时必须阻止新提交，不能静默覆盖后生成重复订单。
    throw new CheckoutStorageError('无法读取上次下单记录')
  }
}

function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
}

/** 先持久化再发请求；任何尚未处理的请求（即使购物车变了）都不能被覆盖。 */
export function beginCheckout(storage: Storage, payload: CheckoutPayload, customerId: number, items: CartItem[], tableCode: string): PendingCheckout {
  if (readPendingCheckout(storage)) throw new Error('请先确认上次下单结果')
  const id = newRequestId()
  const pending: PendingCheckout = {
    id, fingerprint: JSON.stringify(payload), customerId, payload: { clientRequestId: id, ...payload },
    items, tableCode, total: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  }
  try { storage.setItem(CHECKOUT_REQUEST_KEY, JSON.stringify(pending)) } catch { throw new CheckoutStorageError('无法保存下单记录') }
  return pending
}

/** 只清理本次请求，旧异步响应不能清除后续请求。 */
export function finishCheckout(storage: Storage, id: string) {
  if (readPendingCheckout(storage)?.id === id) {
    try { storage.removeItem(CHECKOUT_REQUEST_KEY) } catch { throw new CheckoutStorageError('无法更新下单记录') }
  }
}

export function checkoutMatchesCart(pending: PendingCheckout, qrToken: string | undefined, items: CartItem[]) {
  if (!pending.payload || pending.payload.qrToken !== qrToken) return false
  const payload = checkoutPayload(qrToken, pending.payload.peopleCount, pending.payload.remark || '', items)
  return JSON.stringify(payload) === pending.fingerprint
}
