import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import type { OrderSummary, TableItem } from '../../api/types'
import { changeRate, chartHours, hourlySeries, prepStats, tableStates } from './dashboardData'

const day = '2026-11-23'
const at = (hm: string) => dayjs(`${day}T${hm}:00`).format()
function order(p: Partial<OrderSummary>): OrderSummary {
  return {
    id: 1, orderNo: 'X', status: 'DONE', refundStatus: 'NONE', tableCode: 'A1', platform: 'H5', totalAmount: 0, payAmount: 1000,
    refundedAmount: 0, peopleCount: 1, remark: null, itemCount: 1, items: [], createdAt: at('10:00'), payExpireAt: null,
    paidAt: at('10:05'), acceptedAt: at('10:06'), readyAt: null, cookingStartedAt: null, ...p,
  }
}

describe('dashboard data', () => {
  it('sums net paid amount per paid hour and skips unpaid / closed orders', () => {
    const s = hourlySeries([
      order({ paidAt: at('10:05'), payAmount: 1000 }),
      order({ paidAt: at('10:40'), payAmount: 2000, refundedAmount: 500 }),
      order({ paidAt: at('12:10'), payAmount: 3000 }),
      order({ paidAt: null, payAmount: 9999, payMode: 'PAY_LATER', status: 'MAKING' }),
      order({ paidAt: at('11:00'), payAmount: 9999, status: 'CLOSED' }),
      order({ paidAt: at('23:30'), payAmount: 9999 }),
    ], 10, 12)
    expect(s).toEqual([
      { hour: 10, amount: 2500, orders: 2 },
      { hour: 11, amount: 0, orders: 0 },
      { hour: 12, amount: 3000, orders: 1 },
    ])
  })

  it('derives chart hours from business hours and widens for out-of-hours orders', () => {
    expect(chartHours('10:00-22:00', [])).toEqual([10, 21])
    expect(chartHours('10:00-22:30', [])).toEqual([10, 22])
    expect(chartHours(null, [order({ paidAt: at('08:20') })])).toEqual([8, 21])
  })

  it('buckets prep minutes into ≤10 / 10–15 / >15', () => {
    const s = prepStats([
      order({ cookingStartedAt: at('10:10'), readyAt: at('10:18') }),
      order({ cookingStartedAt: at('10:10'), readyAt: at('10:22') }),
      order({ cookingStartedAt: null, acceptedAt: at('10:00'), readyAt: at('10:20') }),
      order({ readyAt: null }),
    ])
    expect(s).toMatchObject({ served: 3, fast: 1, normal: 1, slow: 1 })
    expect(s.avgMinutes).toBeCloseTo((8 + 12 + 20) / 3)
    expect(prepStats([]).avgMinutes).toBeNull()
  })

  it('marks tables pending / dining / idle and hides disabled tables', () => {
    const tables = [
      { id: 1, code: 'A1', status: 1 }, { id: 2, code: 'A2', status: 1 }, { id: 3, code: 'A3', status: 1 }, { id: 4, code: 'A4', status: 0 },
    ] as TableItem[]
    const s = tableStates(tables, [
      order({ tableCode: 'A1', status: 'PAID', payAmount: 500 }),
      order({ tableCode: 'A1', status: 'MAKING', payAmount: 700 }),
      order({ tableCode: 'A2', status: 'DONE', payMode: 'PAY_LATER', paidAt: null, payAmount: 300 }),
    ])
    expect(s).toEqual([
      { code: 'A1', state: 'PENDING', amount: 1200 },
      { code: 'A2', state: 'DINING', amount: 300 },
      { code: 'A3', state: 'IDLE', amount: 0 },
    ])
  })

  it('returns null change rate when yesterday is empty', () => {
    expect(changeRate(150, 100)).toBeCloseTo(0.5)
    expect(changeRate(150, 0)).toBeNull()
  })
})
