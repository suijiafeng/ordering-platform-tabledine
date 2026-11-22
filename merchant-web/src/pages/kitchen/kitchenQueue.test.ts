import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import type { OrderSummary } from '../../api/types'
import { isOverdue, sortKitchenColumn, splitKitchenColumn, stageOf } from './kitchenQueue'

function order(partial: Partial<OrderSummary> & Pick<OrderSummary, 'orderNo'>): OrderSummary {
  return {
    id: Number(partial.orderNo.replace(/\D/g, '').slice(-4) || 1),
    status: 'MAKING',
    refundStatus: 'NONE',
    tableCode: 'A1',
    platform: 'H5',
    totalAmount: 1000,
    payAmount: 1000,
    refundedAmount: 0,
    peopleCount: 1,
    remark: null,
    itemCount: 1,
    items: [],
    createdAt: '2026-11-22T08:00:00+08:00',
    payExpireAt: null,
    paidAt: '2026-11-22T08:00:00+08:00',
    acceptedAt: '2026-11-22T08:00:00+08:00',
    readyAt: null,
    cookingStartedAt: null,
    cancelRequestStatus: null,
    source: 'CUSTOMER',
    payMode: 'PAY_FIRST',
    ...partial,
  }
}

const now = dayjs('2026-11-22T09:00:00+08:00')

describe('kitchenQueue', () => {
  it('classifies stages from status and cookingStartedAt', () => {
    expect(stageOf(order({ orderNo: '1', status: 'MAKING', cookingStartedAt: null }))).toBe('TODO')
    expect(stageOf(order({ orderNo: '2', status: 'MAKING', cookingStartedAt: '2026-11-22T08:10:00+08:00' }))).toBe('COOKING')
    expect(stageOf(order({ orderNo: '3', status: 'READY', cookingStartedAt: '2026-11-22T08:10:00+08:00', readyAt: '2026-11-22T08:20:00+08:00' }))).toBe('DONE')
  })

  it('treats a ticket as overdue after the stage threshold', () => {
    const fresh = order({ orderNo: 'new', acceptedAt: '2026-11-22T08:58:00+08:00' })
    const stale = order({ orderNo: 'old', acceptedAt: '2026-11-22T08:00:00+08:00' })
    expect(isOverdue(fresh, now)).toBe(false)
    expect(isOverdue(stale, now)).toBe(true)
  })

  it('puts on-time tickets first (oldest first) and overdue tickets after, not on top', () => {
    const overdueNew = order({ orderNo: 'overdue-later', acceptedAt: '2026-11-22T08:10:00+08:00' })
    const overdueOld = order({ orderNo: 'overdue-first', acceptedAt: '2026-11-22T08:00:00+08:00' })
    const currentNew = order({ orderNo: 'fresh-later', acceptedAt: '2026-11-22T08:58:00+08:00' })
    const currentOld = order({ orderNo: 'fresh-first', acceptedAt: '2026-11-22T08:56:00+08:00' })
    const sorted = sortKitchenColumn([overdueNew, currentNew, overdueOld, currentOld], now)
    expect(sorted.map((o) => o.orderNo)).toEqual([
      'fresh-first',
      'fresh-later',
      'overdue-first',
      'overdue-later',
    ])
    const split = splitKitchenColumn([overdueNew, currentNew, overdueOld, currentOld], now)
    expect(split.current.map((o) => o.orderNo)).toEqual(['fresh-first', 'fresh-later'])
    expect(split.overdue.map((o) => o.orderNo)).toEqual(['overdue-first', 'overdue-later'])
  })
})
