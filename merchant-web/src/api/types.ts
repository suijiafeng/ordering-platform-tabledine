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

export interface StaffItem {
  id: number
  username: string
  name: string
  role: 'OWNER' | 'STAFF'
  enabled: boolean
  createdAt: string
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
  /** 今日剩余（每天 0 点重置为 dailyStock） */
  stockQuantity: number | null
  /** 每日限量，null 不限量 */
  dailyStock: number | null
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

// ==================== 订单 / 支付 / 退款 ====================

export type OrderStatus = 'PENDING_PAY' | 'PAID' | 'MAKING' | 'READY' | 'DONE' | 'CLOSED' | 'CANCELLED'
export type OrderRefundStatus = 'NONE' | 'PARTIAL' | 'FULL'
/** H5 = 会员账号，支付走余额 */
export type Platform = 'WECHAT' | 'ALIPAY' | 'H5'
export type RefundStatus = 'APPLYING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WITHDRAWN' | 'OFFLINE'
export type RefundType = 'FULL' | 'ITEM' | 'CUSTOM'
export type RefundInitiator = 'CUSTOMER' | 'MERCHANT' | 'SYSTEM'
export type OperatorType = 'CUSTOMER' | 'MERCHANT' | 'SYSTEM' | 'PAY_CHANNEL'

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
  refundStatus: OrderRefundStatus
  tableCode: string | null
  platform: Platform
  totalAmount: number
  payAmount: number
  refundedAmount: number
  peopleCount: number
  remark: string | null
  itemCount: number
  items: OrderItemView[]
  createdAt: string
  payExpireAt: string | null
  paidAt: string | null
  acceptedAt: string | null
  readyAt: string | null
}

export interface PaymentView {
  outTradeNo: string
  channel: Platform
  status: 'PENDING' | 'SUCCESS' | 'CLOSED'
  transactionNo: string | null
  amount: number
  refundedAmount: number
  paidAt: string | null
}

export interface RefundItemView {
  orderItemId: number
  dishName: string
  specDesc: string | null
  quantity: number
  amount: number
}

export interface RefundView {
  id: number
  refundNo: string
  orderNo: string | null
  tableCode: string | null
  type: RefundType
  initiator: RefundInitiator
  amount: number
  reason: string | null
  rejectReason: string | null
  status: RefundStatus
  failReason: string | null
  channelRefundNo: string | null
  operatorId: number | null
  operatorName: string | null
  createdAt: string
  successAt: string | null
  items: RefundItemView[]
}

export interface OrderStatusLogView {
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  operatorType: OperatorType
  operatorId: number | null
  operatorName: string | null
  remark: string | null
  createdAt: string
}

export interface OrderDetail {
  id: number
  orderNo: string
  status: OrderStatus
  refundStatus: OrderRefundStatus
  storeId: number
  storeName: string
  tableId: number | null
  tableCode: string | null
  platform: Platform
  totalAmount: number
  payAmount: number
  refundedAmount: number
  refundableAmount: number
  peopleCount: number
  remark: string | null
  payExpireAt: string | null
  paidAt: string | null
  acceptedAt: string | null
  readyAt: string | null
  doneAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  items: OrderItemView[]
  payment: PaymentView | null
  refunds: RefundView[]
  logs: OrderStatusLogView[]
  canCancel: boolean
  canApplyRefund: boolean
}

export interface NewOrderCount {
  newPaidCount: number
  pendingAcceptCount: number
  makingCount: number
  applyingRefundCount: number
  failedRefundCount: number
  serverTime: string
  /** 当前所有待接单订单号，前端按集合去重判断新单 */
  pendingOrderNos: string[]
  /** 申请超过 2 小时仍未审核的退款数 */
  overdueRefundCount: number
}

/** 任意日期区间统计，口径与今日看板一致 */
export interface ReportSummary {
  from: string
  to: string
  netIncome: number
  paidAmount: number
  refundedAmount: number
  orderCount: number
  refundCount: number
  /** 区间会员充值金额（预收款，不计入实收） */
  rechargeAmount: number
  topDishes: { dishName: string; quantity: number; amount: number }[]
  daily: { date: string; netIncome: number; orderCount: number }[]
}

/** 会员（H5 账号）：余额由商家充值，下单从余额扣费 */
export interface MemberItem {
  id: number
  phone: string
  name: string
  /** 余额（分） */
  balance: number
  enabled: boolean
  createdAt: string
}

export type WalletTransactionType = 'RECHARGE' | 'PAY' | 'REFUND'

export interface WalletTransaction {
  id: number
  type: WalletTransactionType
  /** true 余额增加（充值 / 退款返还），false 余额减少（下单扣费） */
  credit: boolean
  amount: number
  balanceAfter: number
  orderId: number | null
  outTradeNo: string | null
  refundNo: string | null
  remark: string | null
  createdAt: string
}

export interface UnconfirmedPayment {
  outTradeNo: string
  orderNo: string
  channel: 'WECHAT' | 'ALIPAY'
  amount: number
  createdAt: string
  closedAt: string
}

export interface MerchantRefundRequest {
  type: RefundType
  reason: string
  items?: { orderItemId: number; quantity: number }[]
  amount?: number
}

export interface DashboardToday {
  netIncome: number
  paidAmount: number
  refundedAmount: number
  orderCount: number
  refundCount: number
  /** 今日会员充值金额（预收款，不计入实收） */
  rechargeAmount: number
  pendingAcceptCount: number
  makingCount: number
  readyCount: number
  applyingRefundCount: number
  failedRefundCount: number
  topDishes: { dishName: string; quantity: number; amount: number }[]
  daily: { date: string; netIncome: number; orderCount: number }[]
}
