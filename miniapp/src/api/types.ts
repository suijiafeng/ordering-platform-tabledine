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
