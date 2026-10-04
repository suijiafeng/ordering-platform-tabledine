export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface StaffProfile {
  id: number
  storeId: number
  username: string
  name: string
  role: 'OWNER' | 'STAFF'
}

export interface StaffTokenResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string
  refreshExpiresIn: number
  staff: StaffProfile
}

export interface StoreDetail {
  id: number
  name: string
  logo: string | null
  phone: string | null
  address: string | null
  businessStatus: number
  businessHours: string | null
  autoAccept: boolean
  payTimeoutMin: number
  acceptTimeoutMin: number
  afterSaleHours: number
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface Category {
  id: number
  name: string
  sort: number
  status: number
}

export interface DishItem {
  id: number
  categoryId: number
  name: string
  description: string | null
  price: number
  image: string | null
  sort: number
  status: number
  soldOut: boolean
  stockQuantity: number | null
}

export interface SpecItem {
  id?: number
  name: string
  priceDelta: number
  isDefault: boolean
}

export interface SpecGroup {
  id?: number
  name: string
  required: boolean
  items: SpecItem[]
}

export interface AddonItem {
  id?: number
  name: string
  priceDelta: number
}

export interface AddonGroup {
  id?: number
  name: string
  maxCount: number
  items: AddonItem[]
}

export interface DishDetail {
  dish: DishItem
  specGroups: SpecGroup[]
  addonGroups: AddonGroup[]
}

export interface DishSaveRequest {
  categoryId: number
  name: string
  description?: string | null
  price: number
  image?: string | null
  sort?: number
  status?: number
  specGroups: SpecGroup[]
  addonGroups: AddonGroup[]
}

export interface TableItem {
  id: number
  code: string
  status: number
  qrToken: string
  qrUrl: string
}

export interface UploadResult {
  url: string
  thumbnailUrl: string
  width: number
  height: number
}

export interface StoreUpdateRequest {
  name: string
  logo?: string | null
  phone?: string | null
  address?: string | null
  businessHours?: string | null
  autoAccept: boolean
  payTimeoutMin: number
  acceptTimeoutMin: number
  afterSaleHours: number
}
