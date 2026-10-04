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
