import { describe, expect, it } from 'vitest'
import { defaultSelection, selectionError, unitPrice } from './pricing'
import type { Dish } from './types'

/** 与开发种子一致：奶茶 12 元，规格「中杯」id=1；加料「珍珠」id 也是 1（两张表各自自增，编号必然会撞） */
const milkTea: Dish = {
  id: 3, name: '奶茶', description: null, price: 1200, image: null, soldOut: false, remainingStock: null,
  specGroups: [{ id: 1, name: '杯型', required: true, items: [
    { id: 1, name: '中杯', priceDelta: 0, isDefault: true },
    { id: 2, name: '大杯', priceDelta: 300 },
  ] }],
  addonGroups: [{ id: 1, name: '小料', maxCount: 2, items: [
    { id: 1, name: '珍珠', priceDelta: 200 },
    { id: 2, name: '椰果', priceDelta: 200 },
    { id: 3, name: '布丁', priceDelta: 300 },
  ] }],
}

describe('unitPrice', () => {
  it('规格与加料分别匹配：编号相同的另一类选项不计价', () => {
    expect(unitPrice(milkTea, defaultSelection(milkTea))).toBe(1200)           // 中杯，不加小料
    expect(unitPrice(milkTea, { specItemIds: [2], addonItemIds: [] })).toBe(1500)   // 大杯
    expect(unitPrice(milkTea, { specItemIds: [1], addonItemIds: [1] })).toBe(1400)  // 中杯 + 珍珠
    expect(unitPrice(milkTea, { specItemIds: [2], addonItemIds: [1, 3] })).toBe(2000)
  })

  it('默认选择是合法的', () => {
    expect(selectionError(milkTea, defaultSelection(milkTea))).toBeNull()
  })
})
