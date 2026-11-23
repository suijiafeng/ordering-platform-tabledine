import { describe, expect, it } from 'vitest'
import { activeNavKey, navGroupOf, visibleGroups } from './nav'

describe('grouped side nav', () => {
  it('picks the longest matching item so 代客下单 wins over 订单管理', () => {
    expect(activeNavKey('/orders/new')).toBe('/orders/new')
    expect(activeNavKey('/orders')).toBe('/orders')
    expect(activeNavKey('/')).toBe('/')
    expect(activeNavKey('/ordersx')).toBeNull()
    expect(navGroupOf('/refunds')).toBe('会员与资金')
  })

  it('filters items by role and drops empty groups', () => {
    const kitchen = visibleGroups('KITCHEN')
    expect(kitchen.map((g) => g.label)).toEqual(['经营', '菜品与桌台'])
    expect(kitchen.flatMap((g) => g.items.map((i) => i.key))).toEqual(['/orders', '/kitchen', '/dishes'])
    const staff = visibleGroups('STAFF').flatMap((g) => g.items.map((i) => i.key))
    expect(staff).toContain('/members')
    expect(staff).not.toContain('/refunds')
    expect(visibleGroups('OWNER').map((g) => g.label)).toEqual(['经营', '菜品与桌台', '会员与资金', '系统'])
  })
})
