'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { selectionDescription, selectionError, unitPrice } from '@/lib/pricing'
import type { CartItem, Dish, MenuView, Selection, TableInfo } from '@/lib/types'

export const MAX_QUANTITY = 99

/** 一道菜（所有规格合计）最多可点份数：限量菜按剩余库存，其余 99 */
export const dishLimit = (dish: Pick<Dish, 'remainingStock'>) =>
  dish.remainingStock == null ? MAX_QUANTITY : Math.max(0, Math.min(MAX_QUANTITY, dish.remainingStock))

/** 某道菜在购物车里的总份数（含不同规格） */
export const dishQuantity = (items: CartItem[], dishId: number) =>
  items.filter((item) => item.dishId === dishId).reduce((sum, item) => sum + item.quantity, 0)

/** 购物车里某一行还能加到多少份：这道菜的上限减去其他规格已占用的份数 */
export const itemMax = (items: CartItem[], item: CartItem) =>
  Math.max(0, (item.limit ?? MAX_QUANTITY) - (dishQuantity(items, item.dishId) - item.quantity))

interface OrderingState {
  table: TableInfo | null
  items: CartItem[]
  setTable: (table: TableInfo) => void
  clearTable: () => void
  /** 加入购物车；超过这道菜的可点份数时只加到上限。返回实际加入的份数（0 表示已达上限） */
  add: (dish: Dish, selection: Selection, quantity?: number) => number
  setQuantity: (key: string, quantity: number) => void
  /** 按最新菜单整理购物车：下架 / 售罄 / 选项失效的移除，超过剩余库存的压到上限 */
  reconcile: (menu: MenuView) => { removed: string[]; capped: string[] }
  clear: () => void
}

const itemKey = (dishId: number, selection: Selection) => `${dishId}|${[...selection.specItemIds].sort().join(',')}|${[...selection.addonItemIds].sort().join(',')}`

export const useOrdering = create<OrderingState>()(persist((set, get) => ({
  table: null,
  items: [],
  // 购物车属于一张具体桌台；同店换桌也不能沿用，避免把菜下到错误桌号。
  setTable: (table) => set((state) => state.table?.tableId === table.tableId ? { table } : { table, items: [] }),
  clearTable: () => set({ table: null, items: [] }),
  add: (dish, selection, quantity = 1) => {
    const items = get().items
    const added = Math.max(0, Math.min(quantity, dishLimit(dish) - dishQuantity(items, dish.id)))
    if (added === 0) return 0
    const key = itemKey(dish.id, selection)
    const existing = items.find((item) => item.key === key)
    if (existing) {
      set({ items: items.map((item) => item.key === key ? { ...item, quantity: item.quantity + added, limit: dishLimit(dish) } : item) })
    } else {
      set({ items: [...items, {
        key, dishId: dish.id, name: dish.name, image: dish.image, ...selection, ...selectionDescription(dish, selection),
        unitPrice: unitPrice(dish, selection), quantity: added, limit: dishLimit(dish),
      }] })
    }
    return added
  },
  setQuantity: (key, quantity) => set((state) => ({ items: state.items.map((item) => item.key === key ? { ...item, quantity: Math.min(itemMax(state.items, item), quantity) } : item).filter((item) => item.quantity > 0) })),
  reconcile: (menu) => {
    const dishes = new Map(menu.categories.flatMap((category) => category.dishes).map((dish) => [dish.id, dish]))
    const removed: string[] = []
    const capped: string[] = []
    const used = new Map<number, number>()
    set((state) => ({ items: state.items.flatMap((item) => {
      const dish = dishes.get(item.dishId)
      if (!dish || dish.soldOut || selectionError(dish, item)) { removed.push(item.name); return [] }
      const before = used.get(dish.id) ?? 0
      const quantity = Math.min(item.quantity, dishLimit(dish) - before)
      if (quantity <= 0) { removed.push(item.name); return [] }
      if (quantity < item.quantity) capped.push(item.name)
      used.set(dish.id, before + quantity)
      return [{ ...item, name: dish.name, image: dish.image, ...selectionDescription(dish, item), unitPrice: unitPrice(dish, item), quantity, limit: dishLimit(dish) }]
    }) }))
    return { removed, capped }
  },
  clear: () => set({ items: [] }),
}), { name: 'ordering-customer-state' }))

export const cartCount = (items: CartItem[]) => items.reduce((sum, item) => sum + item.quantity, 0)
export const cartTotal = (items: CartItem[]) => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
