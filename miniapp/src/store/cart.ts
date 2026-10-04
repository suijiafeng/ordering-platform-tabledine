import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { MenuDish, MenuView } from '../api/types'
import { calcUnitPrice, describeSelection, type Selection, validateSelection } from '../utils/price'
import { toast } from '../utils/toast'

export interface CartItem {
  /** 同一菜品 + 同一规格加料组合视为同一项 */
  key: string
  dishId: number
  name: string
  image: string | null
  specItemIds: number[]
  addonItemIds: number[]
  specDesc: string
  addonDesc: string
  unitPrice: number
  quantity: number
}

const MAX_QTY_PER_ITEM = 99
/** 与后端 CreateOrderRequest.items @Size(max=50) 一致 */
const MAX_LINES = 50
const storageKey = (storeId: number) => `cart_${storeId}`

interface CartState {
  storeId: number | null
  items: CartItem[]
  /** 切换门店时加载该门店的购物车 */
  bindStore: (storeId: number) => void
  add: (dish: MenuDish, sel: Selection, quantity?: number) => void
  changeQty: (key: string, delta: number) => void
  clear: () => void
  /** 菜单刷新后对账：移除已下架 / 售罄 / 规格变更的项，并按最新价格重算 */
  reconcile: (menu: MenuView) => string[]
}

export function cartKey(dishId: number, sel: Selection): string {
  const s = [...sel.specItemIds].sort((a, b) => a - b).join(',')
  const a = [...sel.addonItemIds].sort((x, y) => x - y).join(',')
  return `${dishId}|${s}|${a}`
}

function persist(storeId: number | null, items: CartItem[]) {
  if (storeId != null) {
    Taro.setStorageSync(storageKey(storeId), items)
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  storeId: null,
  items: [],

  bindStore: (storeId) => {
    if (get().storeId === storeId) return
    const saved = Taro.getStorageSync<CartItem[]>(storageKey(storeId))
    set({ storeId, items: Array.isArray(saved) ? saved : [] })
  },

  add: (dish, sel, quantity = 1) => {
    const key = cartKey(dish.id, sel)
    const items = [...get().items]
    const existing = items.find((i) => i.key === key)
    if (existing) {
      existing.quantity = Math.min(MAX_QTY_PER_ITEM, existing.quantity + quantity)
    } else {
      if (items.length >= MAX_LINES) {
        toast(`单笔订单最多 ${MAX_LINES} 种菜品`)
        return
      }
      items.push({
        key,
        dishId: dish.id,
        name: dish.name,
        image: dish.image,
        specItemIds: sel.specItemIds,
        addonItemIds: sel.addonItemIds,
        ...describeSelection(dish, sel),
        unitPrice: calcUnitPrice(dish, sel),
        quantity: Math.min(MAX_QTY_PER_ITEM, quantity),
      })
    }
    set({ items })
    persist(get().storeId, items)
  },

  changeQty: (key, delta) => {
    const items = get().items
      .map((i) => (i.key === key ? { ...i, quantity: Math.min(MAX_QTY_PER_ITEM, i.quantity + delta) } : i))
      .filter((i) => i.quantity > 0)
    set({ items })
    persist(get().storeId, items)
  },

  clear: () => {
    set({ items: [] })
    persist(get().storeId, [])
  },

  reconcile: (menu) => {
    const dishes = new Map<number, MenuDish>()
    menu.categories.forEach((c) => c.dishes.forEach((d) => dishes.set(d.id, d)))
    const removed: string[] = []
    const items: CartItem[] = []
    for (const item of get().items) {
      const dish = dishes.get(item.dishId)
      const sel = { specItemIds: item.specItemIds, addonItemIds: item.addonItemIds }
      if (!dish || dish.soldOut || validateSelection(dish, sel)) {
        removed.push(item.name)
        continue
      }
      items.push({ ...item, name: dish.name, image: dish.image, ...describeSelection(dish, sel), unitPrice: calcUnitPrice(dish, sel) })
    }
    set({ items })
    persist(get().storeId, items)
    return removed
  },
}))

export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.quantity, 0)
export const cartTotal = (items: CartItem[]) => items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
export const dishQty = (items: CartItem[], dishId: number) =>
  items.filter((i) => i.dishId === dishId).reduce((s, i) => s + i.quantity, 0)
