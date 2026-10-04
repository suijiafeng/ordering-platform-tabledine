import type { MenuDish } from '../api/types'

export interface Selection {
  specItemIds: number[]
  addonItemIds: number[]
}

/**
 * 单价 = 基础价 + Σ所选规格项加价 + Σ所选加料项加价（与后端计算规则一致，仅用于展示；下单以后端计算为准）
 */
export function calcUnitPrice(dish: MenuDish, sel: Selection): number {
  let price = dish.price
  for (const g of dish.specGroups) {
    for (const i of g.items) {
      if (sel.specItemIds.includes(i.id)) price += i.priceDelta
    }
  }
  for (const g of dish.addonGroups) {
    for (const i of g.items) {
      if (sel.addonItemIds.includes(i.id)) price += i.priceDelta
    }
  }
  return price
}

/** 校验选择是否合法，返回错误提示；合法返回 null */
export function validateSelection(dish: MenuDish, sel: Selection): string | null {
  for (const g of dish.specGroups) {
    const chosen = g.items.filter((i) => sel.specItemIds.includes(i.id)).length
    if (g.required && chosen === 0) return `请选择${g.name}`
    if (chosen > 1) return `${g.name}只能选一项`
  }
  for (const g of dish.addonGroups) {
    const chosen = g.items.filter((i) => sel.addonItemIds.includes(i.id)).length
    if (chosen > g.maxCount) return `${g.name}最多选 ${g.maxCount} 项`
  }
  const knownSpec = new Set(dish.specGroups.flatMap((g) => g.items.map((i) => i.id)))
  const knownAddon = new Set(dish.addonGroups.flatMap((g) => g.items.map((i) => i.id)))
  if (sel.specItemIds.some((id) => !knownSpec.has(id)) || sel.addonItemIds.some((id) => !knownAddon.has(id))) {
    return '菜品规格已变更，请重新选择'
  }
  return null
}

/** 默认选择：每个规格组选默认项（没有默认项且必选时选第一项），加料不选 */
export function defaultSelection(dish: MenuDish): Selection {
  const specItemIds: number[] = []
  for (const g of dish.specGroups) {
    const def = g.items.find((i) => i.isDefault) ?? (g.required ? g.items[0] : undefined)
    if (def) specItemIds.push(def.id)
  }
  return { specItemIds, addonItemIds: [] }
}

export function describeSelection(dish: MenuDish, sel: Selection): { specDesc: string; addonDesc: string } {
  const specDesc = dish.specGroups
    .flatMap((g) => g.items.filter((i) => sel.specItemIds.includes(i.id)).map((i) => i.name))
    .join('/')
  const addonDesc = dish.addonGroups
    .flatMap((g) => g.items.filter((i) => sel.addonItemIds.includes(i.id)).map((i) => i.name))
    .join('、')
  return { specDesc, addonDesc }
}

export function hasOptions(dish: MenuDish): boolean {
  return dish.specGroups.length > 0 || dish.addonGroups.length > 0
}
