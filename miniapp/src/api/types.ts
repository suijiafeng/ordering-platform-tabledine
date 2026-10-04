export interface QrResolveView {
  storeId: number
  storeName: string
  storeOpen: boolean
  tableId: number
  tableCode: string
}

export interface CustomerProfile {
  id: number
  nickname: string | null
  avatar: string | null
  platform: 'WECHAT' | 'ALIPAY'
}

export interface SpecItem {
  id: number
  name: string
  priceDelta: number
  isDefault: boolean
}

export interface SpecGroup {
  id: number
  name: string
  required: boolean
  items: SpecItem[]
}

export interface AddonItem {
  id: number
  name: string
  priceDelta: number
}

export interface AddonGroup {
  id: number
  name: string
  maxCount: number
  items: AddonItem[]
}

export interface MenuDish {
  id: number
  name: string
  description: string | null
  price: number
  image: string | null
  soldOut: boolean
  specGroups: SpecGroup[]
  addonGroups: AddonGroup[]
}

export interface MenuCategory {
  id: number
  name: string
  dishes: MenuDish[]
}

export interface MenuView {
  storeId: number
  categories: MenuCategory[]
}
