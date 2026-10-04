export interface QrResolveView {
  storeId: number
  storeName: string
  storeOpen: boolean
  tableId: number
  tableCode: string
  /** 前端附加：本次扫码的桌码 token，下单时回传给服务端校验 */
  qrToken?: string
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)

export type OrderStatus = 'PENDING_PAY' | 'PAID' | 'MAKING' | 'READY' | 'DONE' | 'CLOSED' | 'CANCELLED'
export type RefundStatus = 'APPLYING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WITHDRAWN' | 'OFFLINE'

export interface OrderItemView {
  id: number
  dishId: number
  dishName: string
  dishImage: string | null
  specDesc: string | null
  addonDesc: string | null
  unitPrice: number
  quantity: number
  totalPrice: number
  refundedQty: number
}

export interface OrderSummary {
  id: number
  orderNo: string
  status: OrderStatus
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL'
  tableCode: string
  totalAmount: number
  payAmount: number
  refundedAmount: number
  itemCount: number
  items: OrderItemView[]
  createdAt: string
  payExpireAt: string | null
}

export interface RefundView {
  refundNo: string
  amount: number
  reason: string
  rejectReason: string | null
  failReason: string | null
  status: RefundStatus
  createdAt: string
  items: { orderItemId: number; dishName: string; specDesc: string | null; quantity: number; amount: number }[]
}

export interface OrderStatusLog {
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  remark: string | null
  createdAt: string
}

export interface OrderDetail extends OrderSummary {
  storeName: string
  peopleCount: number
  remark: string | null
  refundableAmount: number
  paidAt: string | null
  cancelReason: string | null
  refunds: RefundView[]
  logs: OrderStatusLog[]
  canCancel: boolean
  canApplyRefund: boolean
}

export interface PayInitResult {
  orderNo: string
  outTradeNo: string
  channel: 'WECHAT' | 'ALIPAY'
  amount: number
  mock: boolean
  params: Record<string, string | number | boolean>
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
<<<<<<< HEAD
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
