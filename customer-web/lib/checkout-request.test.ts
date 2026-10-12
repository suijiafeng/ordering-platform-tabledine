import { describe, expect, it } from 'vitest'
import { beginCheckout, CHECKOUT_REQUEST_KEY, checkoutMatchesCart, checkoutPayload, finishAbandonedCheckout, finishCheckout, readPendingCheckout } from './checkout-request'
import type { CartItem, OrderDetail } from './types'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
const cart: CartItem[] = [{ key: '1|2|3', dishId: 1, name: '原菜品', image: null, specItemIds: [2], addonItemIds: [3], specDesc: '大份', addonDesc: '加蛋', unitPrice: 3800, quantity: 1 }]
const payload = checkoutPayload('table-a', 2, '少盐', cart)

describe('unresolved checkout identity', () => {
  it('lost response + changed cart + reload retains the original request and rejects replacement', () => {
    const saved = storage()
    const original = beginCheckout(saved, payload, 7, cart, 'A1')
    const changed = checkoutPayload('table-a', 3, '新备注', [{ ...cart[0], quantity: 2 }])
    expect(() => beginCheckout(saved, changed, 7, cart, 'A1')).toThrow('请先确认上次下单结果')
    const reloaded = readPendingCheckout(saved)!
    expect(reloaded.id).toBe(original.id)
    expect(reloaded.payload).toEqual({ clientRequestId: original.id, ...payload })
    expect(reloaded.customerId).toBe(7)
    expect(checkoutMatchesCart(reloaded, 'table-a', cart)).toBe(true)
    expect(checkoutMatchesCart(reloaded, 'table-a', [{ ...cart[0], specItemIds: [4] }])).toBe(false)
    expect(checkoutMatchesCart(reloaded, 'table-b', cart)).toBe(false)
  })

  it('releases only the resolved request and cannot erase a newer attempt with an old response', () => {
    const saved = storage()
    const first = beginCheckout(saved, payload, 7, cart, 'A1')
    finishCheckout(saved, first.id)
    const second = beginCheckout(saved, payload, 7, cart, 'A1')
    finishCheckout(saved, first.id)
    expect(readPendingCheckout(saved)?.id).toBe(second.id)
  })

  it('preserves legacy identities for lookup instead of silently generating new IDs', () => {
    const saved = storage()
    saved.setItem(CHECKOUT_REQUEST_KEY, JSON.stringify({ id: 'legacy', fingerprint: JSON.stringify(payload) }))
    expect(readPendingCheckout(saved)?.id).toBe('legacy')
    expect(() => beginCheckout(saved, payload, 7, cart, 'A1')).toThrow()
  })

  it('fails closed when the recovery record cannot be read or persisted', () => {
    const saved = storage()
    saved.setItem(CHECKOUT_REQUEST_KEY, 'broken json')
    expect(() => beginCheckout(saved, payload, 7, cart, 'A1')).toThrow()
    expect(saved.getItem(CHECKOUT_REQUEST_KEY)).toBe('broken json')
    expect(() => beginCheckout({ ...storage(), setItem: () => { throw new Error('quota') } }, payload, 7, cart, 'A1')).toThrow('无法保存下单记录')
  })

  it('can release a legacy record only after server-confirmed abandonment', () => {
    const saved = storage()
    saved.setItem(CHECKOUT_REQUEST_KEY, JSON.stringify({ id: 'legacy', fingerprint: JSON.stringify(payload) }))
    expect(finishAbandonedCheckout(saved, 'legacy', { abandoned: false, order: null })).toBe(false)
    expect(readPendingCheckout(saved)?.id).toBe('legacy')
    expect(finishAbandonedCheckout(saved, 'legacy', { abandoned: true, order: null })).toBe(true)
    expect(readPendingCheckout(saved)).toBeNull()
    expect(beginCheckout(saved, payload, 7, cart, 'A1').id).not.toBe('legacy')
  })

  it('keeps an existing original order blocked for review when abandonment loses the race', () => {
    const saved = storage()
    const original = beginCheckout(saved, payload, 7, cart, 'A1')
    const order = { orderNo: 'original', status: 'PENDING_PAY' } as OrderDetail
    expect(finishAbandonedCheckout(saved, original.id, { abandoned: false, order })).toBe(false)
    expect(readPendingCheckout(saved)?.id).toBe(original.id)
    expect(finishAbandonedCheckout(saved, original.id, { abandoned: true, order })).toBe(false)
  })

  it('a stale abandonment response cannot release a newer request', () => {
    const saved = storage()
    const original = beginCheckout(saved, payload, 7, cart, 'A1')
    finishCheckout(saved, original.id)
    const newer = beginCheckout(saved, payload, 7, cart, 'A1')
    expect(finishAbandonedCheckout(saved, original.id, { abandoned: true, order: null })).toBe(false)
    expect(readPendingCheckout(saved)?.id).toBe(newer.id)
  })
})
