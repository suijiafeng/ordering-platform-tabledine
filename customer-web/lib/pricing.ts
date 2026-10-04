import type { Dish, Selection } from './types'

export function defaultSelection(dish: Dish): Selection {
  return {
    specItemIds: dish.specGroups.flatMap((group) => {
      const preferred = group.items.find((item) => item.isDefault) ?? (group.required ? group.items[0] : undefined)
      return preferred ? [preferred.id] : []
    }),
    addonItemIds: [],
  }
}

export const hasOptions = (dish: Dish) => dish.specGroups.length > 0 || dish.addonGroups.length > 0

export function unitPrice(dish: Dish, selection: Selection) {
  const ids = new Set([...selection.specItemIds, ...selection.addonItemIds])
  const delta = [...dish.specGroups, ...dish.addonGroups]
    .flatMap((group) => group.items).filter((item) => ids.has(item.id)).reduce((sum, item) => sum + item.priceDelta, 0)
  return dish.price + delta
}

export function selectionDescription(dish: Dish, selection: Selection) {
  const spec = dish.specGroups.flatMap((g) => g.items).filter((i) => selection.specItemIds.includes(i.id)).map((i) => i.name).join('、')
  const addon = dish.addonGroups.flatMap((g) => g.items).filter((i) => selection.addonItemIds.includes(i.id)).map((i) => i.name).join('、')
  return { specDesc: spec, addonDesc: addon }
}

export function selectionError(dish: Dish, selection: Selection): string | null {
  for (const group of dish.specGroups) {
    const selected = group.items.filter((item) => selection.specItemIds.includes(item.id))
    if (group.required && selected.length === 0) return `请选择${group.name}`
    if (selected.length > 1) return `${group.name}只能选择一项`
  }
  for (const group of dish.addonGroups) {
    const selected = group.items.filter((item) => selection.addonItemIds.includes(item.id))
    if (selected.length > group.maxCount) return `${group.name}最多选择 ${group.maxCount} 项`
  }
  const validSpecs = new Set(dish.specGroups.flatMap((group) => group.items.map((item) => item.id)))
  const validAddons = new Set(dish.addonGroups.flatMap((group) => group.items.map((item) => item.id)))
  if (selection.specItemIds.some((id) => !validSpecs.has(id)) || selection.addonItemIds.some((id) => !validAddons.has(id))) return '菜品选项已更新，请重新选择'
  return null
}
