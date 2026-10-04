'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { selectionDescription, selectionError, unitPrice } from '@/lib/pricing'
import type { CartItem, Dish, MenuView, Selection, TableInfo } from '@/lib/types'

interface OrderingState {
  table: TableInfo | null
  items: CartItem[]
  setTable: (table: TableInfo) => void
  clearTable: () => void
  add: (dish: Dish, selection: Selection, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  reconcile: (menu: MenuView) => string[]
  clear: () => void
}

const itemKey = (dishId: number, selection: Selection) => `${dishId}|${[...selection.specItemIds].sort().join(',')}|${[...selection.addonItemIds].sort().join(',')}`

export const useOrdering = create<OrderingState>()(persist((set) => ({
  table: null,
  items: [],
  // 购物车属于一张具体桌台；同店换桌也不能沿用，避免把菜下到错误桌号。
  setTable: (table) => set((state) => state.table?.tableId === table.tableId ? { table } : { table, items: [] }),
  clearTable: () => set({ table: null, items: [] }),
  add: (dish, selection, quantity = 1) => set((state) => {
    const key = itemKey(dish.id, selection)
    const existing = state.items.find((item) => item.key === key)
    if (existing) return { items: state.items.map((item) => item.key === key ? { ...item, quantity: Math.min(99, item.quantity + quantity) } : item) }
    return { items: [...state.items, {
      key, dishId: dish.id, name: dish.name, image: dish.image, ...selection, ...selectionDescription(dish, selection),
      unitPrice: unitPrice(dish, selection), quantity: Math.min(99, quantity),
    }] }
  }),
  setQuantity: (key, quantity) => set((state) => ({ items: state.items.map((item) => item.key === key ? { ...item, quantity: Math.min(99, quantity) } : item).filter((item) => item.quantity > 0) })),
  reconcile: (menu) => {
    const dishes = new Map(menu.categories.flatMap((category) => category.dishes).map((dish) => [dish.id, dish]))
    const removed: string[] = []
    set((state) => ({ items: state.items.flatMap((item) => {
      const dish = dishes.get(item.dishId)
      if (!dish || dish.soldOut || selectionError(dish, item)) { removed.push(item.name); return [] }
      return [{ ...item, name: dish.name, image: dish.image, ...selectionDescription(dish, item), unitPrice: unitPrice(dish, item) }]
    }) }))
    return removed
  },
  clear: () => set({ items: [] }),
}), { name: 'ordering-customer-state' }))

export const cartCount = (items: CartItem[]) => items.reduce((sum, item) => sum + item.quantity, 0)
export const cartTotal = (items: CartItem[]) => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

/** 某道菜在购物车里的总份数（含不同规格） */
export const dishQuantity = (items: CartItem[], dishId: number) =>
  items.filter((item) => item.dishId === dishId).reduce((sum, item) => sum + item.quantity, 0)
