import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newOrderCount } from '../api/order'
import type { NewOrderCount } from '../api/types'
import {
  diffPendingOrders, readSeenOrders, resetOrderPollMemory, restoreSeenOrdersFromSession,
  useOrderPoll, usePollStore, writeSeenOrders, SEEN_ORDERS_KEY,
} from './useOrderPoll'

vi.mock('../api/order', () => ({ newOrderCount: vi.fn() }))
vi.mock('../utils/sound', () => ({
  playSound: vi.fn(),
  useSoundStore: { getState: () => ({ enabled: false, blocked: false }), setState: vi.fn() },
}))

function counts(pending: string[]): NewOrderCount {
  return {
    newPaidCount: pending.length,
    pendingAcceptCount: pending.length,
    makingCount: 0,
    applyingRefundCount: 0,
    failedRefundCount: 0,
    serverTime: '2026-11-22T00:00:00Z',
    pendingOrderNos: pending,
    overdueRefundCount: 0,
    makingOrderNos: [],
  }
}

afterEach(() => {
  resetOrderPollMemory()
  vi.mocked(newOrderCount).mockReset()
})

describe('diffPendingOrders', () => {
  it('treats the first observation as a baseline, not as new arrivals', () => {
    const { next, initialCount, fresh } = diffPendingOrders(null, ['A', 'B'])
    expect(initialCount).toBe(2)
    expect(fresh).toEqual([])
    expect([...next]).toEqual(['A', 'B'])
  })

  it('returns only newly appeared orders on later ticks', () => {
    const seen = new Set(['A', 'B'])
    const { initialCount, fresh, next } = diffPendingOrders(seen, ['B', 'C'])
    expect(initialCount).toBeNull()
    expect(fresh).toEqual(['C'])
    expect(next.has('A')).toBe(false)
    expect([...next].sort()).toEqual(['B', 'C'])
  })

  it('returns no initial toast and no fresh orders when the set is unchanged', () => {
    const { initialCount, fresh } = diffPendingOrders(new Set(['A']), ['A'])
    expect(initialCount).toBeNull()
    expect(fresh).toEqual([])
  })
})

describe('seen orders session storage', () => {
  it('round-trips the set and clears it on logout reset', () => {
    writeSeenOrders(new Set(['O-1', 'O-2']))
    expect(sessionStorage.getItem(SEEN_ORDERS_KEY)).toBeTruthy()
    expect([...readSeenOrders() ?? []].sort()).toEqual(['O-1', 'O-2'])
    resetOrderPollMemory()
    expect(readSeenOrders()).toBeNull()
    expect(sessionStorage.getItem(SEEN_ORDERS_KEY)).toBeNull()
  })
})

describe('useOrderPoll session baseline', () => {
  it('does not re-open the initial pending notification after a refresh', async () => {
    vi.mocked(newOrderCount).mockResolvedValue(counts(['NO-1', 'NO-2']))

    const first = renderHook(() => useOrderPoll(60_000))
    await waitFor(() => expect(usePollStore.getState().initialPending).toBe(2))
    usePollStore.getState().consumeInitial()
    expect(usePollStore.getState().initialPending).toBe(0)
    first.unmount()

    // 刷新：模块记忆从 sessionStorage 恢复，同一批待接单不再弹窗
    restoreSeenOrdersFromSession()
    const second = renderHook(() => useOrderPoll(60_000))
    await waitFor(() => expect(usePollStore.getState().counts?.pendingOrderNos).toEqual(['NO-1', 'NO-2']))
    expect(usePollStore.getState().initialPending).toBe(0)
    expect(usePollStore.getState().lastArrival).toBeNull()
    second.unmount()
  })

  it('still notifies when a new order appears after refresh', async () => {
    vi.mocked(newOrderCount).mockResolvedValue(counts(['NO-1']))
    const first = renderHook(() => useOrderPoll(60_000))
    await waitFor(() => expect(usePollStore.getState().initialPending).toBe(1))
    usePollStore.getState().consumeInitial()
    first.unmount()

    restoreSeenOrdersFromSession()
    vi.mocked(newOrderCount).mockResolvedValue(counts(['NO-1', 'NO-3']))
    const second = renderHook(() => useOrderPoll(60_000))
    await waitFor(() => expect(usePollStore.getState().lastArrival?.orderNos).toEqual(['NO-3']))
    expect(usePollStore.getState().initialPending).toBe(0)
    second.unmount()
  })
})
