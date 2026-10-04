export interface TableInfo {
  storeId: number
  storeName: string
  storeOpen: boolean
  tableId: number
  tableCode: string
  qrToken: string
}

export interface OptionItem { id: number; name: string; priceDelta: number; isDefault?: boolean }
export interface SpecGroup { id: number; name: string; required: boolean; items: OptionItem[] }
export interface AddonGroup { id: number; name: string; maxCount: number; items: OptionItem[] }
export interface Dish {
  id: number; name: string; description: string | null; price: number; image: string | null; soldOut: boolean
  specGroups: SpecGroup[]; addonGroups: AddonGroup[]
}
export interface MenuCategory { id: number; name: string; dishes: Dish[] }
export interface MenuView { storeId: number; categories: MenuCategory[] }

export interface Selection { specItemIds: number[]; addonItemIds: number[] }
export interface CartItem extends Selection {
  key: string; dishId: number; name: string; image: string | null; specDesc: string; addonDesc: string
  unitPrice: number; quantity: number
}

export type OrderStatus = 'PENDING_PAY' | 'PAID' | 'MAKING' | 'READY' | 'DONE' | 'CLOSED' | 'CANCELLED'
export interface OrderItem {
  id: number; dishId: number; dishName: string; dishImage: string | null; specDesc: string | null
  addonDesc: string | null; unitPrice: number; quantity: number; totalPrice: number; refundedQty: number
}
export interface OrderSummary {
  id: number; orderNo: string; status: OrderStatus; refundStatus: 'NONE' | 'PARTIAL' | 'FULL'; tableCode: string
  totalAmount: number; payAmount: number; refundedAmount: number; itemCount: number; items: OrderItem[]
  createdAt: string; payExpireAt: string | null
}
export type RefundStatus = 'APPLYING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WITHDRAWN' | 'OFFLINE'
export interface RefundRecord {
  refundNo: string; amount: number; reason: string; rejectReason: string | null; failReason: string | null
  status: RefundStatus; createdAt: string
  items: { orderItemId: number; dishName: string; specDesc: string | null; quantity: number; amount: number }[]
}
export interface OrderDetail extends OrderSummary {
  storeName: string; peopleCount: number; remark: string | null; refundableAmount: number; paidAt: string | null
  cancelReason: string | null; refunds: RefundRecord[]; canCancel: boolean; canApplyRefund: boolean
  logs: { toStatus: OrderStatus; operatorType: string | null; remark: string | null; createdAt: string }[]
}
export interface CustomerProfile {
  id: number; nickname: string | null; phone: string | null; balance: number; member: boolean
}
export interface WalletTransaction {
  id: number; type: 'RECHARGE' | 'PAY' | 'REFUND'; credit: boolean; amount: number; balanceAfter: number
  outTradeNo: string | null; remark: string | null; createdAt: string
}
export interface PageResult<T> { list: T[]; total: number; page: number; pageSize: number }

/** 发起支付结果。H5 会员一律余额支付：params.paid=true 表示已在同一事务里扣费入账 */
export interface PayInitResult {
  orderNo: string; outTradeNo: string; amount: number
  params: { balance?: boolean; paid?: boolean } | null
}
