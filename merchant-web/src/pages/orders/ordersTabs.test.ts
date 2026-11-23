import { describe, expect, it } from 'vitest'
import { ACTIVE_TAB, ALL_TAB, TABS, tabQuery } from './OrdersPage'
import { summarizeItems } from '../../components/NewOrderBanner'
import type { NewOrderCount, OrderItemView } from '../../api/types'

const counts = {
  pendingAcceptCount: 3, makingCount: 1, readyCount: 2, cancelRequestCount: 1, unsettledCount: 0,
} as NewOrderCount

describe('order tabs', () => {
  it('maps tabs to list query params', () => {
    expect(tabQuery(ACTIVE_TAB)).toEqual({ status: 'PAID,MAKING,READY' })
    expect(tabQuery(ALL_TAB)).toEqual({})
    expect(tabQuery('CANCEL_REQUEST')).toEqual({ cancelRequest: 'APPLYING' })
    expect(tabQuery('UNSETTLED')).toEqual({ unsettled: true })
    expect(tabQuery('PENDING_PAY,CLOSED')).toEqual({ status: 'PENDING_PAY,CLOSED' })
  })

  it('counts 进行中 as pending + making + ready', () => {
    const active = TABS.find((t) => t.key === ACTIVE_TAB)!
    expect(active.count!(counts)).toBe(6)
    expect(TABS.find((t) => t.key === 'PAID')!.count!(counts)).toBe(3)
  })
})

describe('new order banner summary', () => {
  const item = (dishName: string, quantity: number, specDesc: string | null = null) => ({ dishName, quantity, specDesc }) as OrderItemView
  it('shows at most two dishes', () => {
    expect(summarizeItems({ items: [item('珍珠奶茶', 2, '大杯')] })).toBe('珍珠奶茶(大杯) ×2')
    expect(summarizeItems({ items: [item('剁椒鱼头', 1), item('米饭', 3), item('凉拌黄瓜', 1)] })).toBe('剁椒鱼头 ×1、米饭 ×3 等 3 道')
  })
})
