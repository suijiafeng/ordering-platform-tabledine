/** 员工角色：店主 / 前厅（接单、拒单、送达）/ 后厨（只处理前厅确认过的订单：出餐）——权责分离 */
export type StaffRole = 'OWNER' | 'STAFF' | 'KITCHEN'

/** 顾客接单后申请取消：待处理 / 已同意（订单已取消并退款）/ 已拒绝 */
export type CancelRequestStatus = 'APPLYING' | 'APPROVED' | 'REJECTED'

export interface CancelRequestView {
  status: CancelRequestStatus
  reason: string | null
  requestedAt: string
  rejectReason: string | null
  handledAt: string | null
}

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
  role: StaffRole
}

export interface StaffItem {
  id: number
  username: string
  name: string
  role: StaffRole
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
/** H5 = 会员余额支付（唯一在用）；WECHAT / ALIPAY 为已停用渠道的历史数据 */
export type Platform = 'WECHAT' | 'ALIPAY' | 'H5' | 'OFFLINE'
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
  /** 后厨点「开始制作」的时间；制作中且为空 = 待制作（旧版后端无该字段） */
  cookingStartedAt?: string | null
  /** 顾客接单后的取消申请状态，没有申请为空 */
  cancelRequestStatus?: CancelRequestStatus | null
  source?: OrderSource
  /** PAY_FIRST 先付后吃 / PAY_LATER 先吃后付；先吃后付且 paidAt 为空 = 未结账 */
  payMode?: PayMode
}

export interface PaymentView {
  outTradeNo: string
  channel: Platform
  status: 'PENDING' | 'SUCCESS' | 'CLOSED'
  transactionNo: string | null
  amount: number
  refundedAmount: number
  paidAt: string | null
  /** 线下收款方式（channel = OFFLINE）：现金 / 微信 / 支付宝 / 银行卡 / 其他 */
  payMethod?: OfflinePayMethod | null
  remark?: string | null
}

/** 前厅代客下单时登记的线下收款方式 */
export type OfflinePayMethod = 'CASH' | 'WECHAT' | 'ALIPAY' | 'CARD' | 'OTHER'

/** 代客下单的付款模式 */
export type PayMode = 'PAY_FIRST' | 'PAY_LATER'

/** 下单来源：顾客扫码 / 前厅代客下单 */
export type OrderSource = 'CUSTOMER' | 'MERCHANT'

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
  /** 后厨开始制作时间；制作中且为空 = 待制作（旧版后端无该字段） */
  cookingStartedAt?: string | null
  /** 顾客接单后的取消申请；没有申请过为空 */
  cancelRequest?: CancelRequestView | null
  source?: OrderSource
  /** PAY_FIRST 先付后吃 / PAY_LATER 先吃后付；先吃后付且 paidAt 为空 = 未结账 */
  payMode?: PayMode
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
  /** 待送餐（已出餐）订单数；旧版后端没有该字段，按 0 处理 */
  readyCount?: number
  /** 当前所有制作中订单号：后厨账号据此提醒「前厅新确认了一单」 */
  makingOrderNos?: string[]
  /** 顾客申请取消、待前厅 / 店主处理的订单数 */
  cancelRequestCount?: number
  /** 先吃后付、还没结账的订单数 */
  unsettledCount?: number
}

/** 任意日期区间统计，口径与今日看板一致 */
/** 每日统计：实收 = 支付金额 − 退款金额（支付按支付日期、退款按退款成功日期归日） */
export interface DailyPoint {
  date: string
  netIncome: number
  orderCount: number
  paidAmount: number
  refundedAmount: number
}

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
  daily: DailyPoint[]
  /** 按收款方式：BALANCE 会员余额；线下 CASH / WECHAT / ALIPAY / CARD / OTHER（旧版后端无该字段） */
  byPayMethod?: { method: string; label: string; amount: number; orderCount: number }[]
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


export interface MerchantRefundRequest {
  /** 一次退款意图的不可变编号；网络重试必须沿用，确认成功后新退款才换号 */
  clientRequestId: string
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
  daily: DailyPoint[]
}

// ==================== 审计日志 ====================

/** 操作类别：与后端 AuditOpType 一致 */
export type AuditOpType = 'LOGIN' | 'VIEW' | 'EXPORT' | 'FUND' | 'SECURITY' | 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS' | 'SYSTEM'

export interface AuditLogItem {
  id: number
  /** STAFF 员工 / CUSTOMER 顾客 / SYSTEM 系统 / ANONYMOUS 未登录 */
  actorType: 'STAFF' | 'CUSTOMER' | 'SYSTEM' | 'ANONYMOUS'
  actorId: number | null
  actorName: string | null
  actorRole: StaffRole | null
  /** 模块：订单、退款、会员…… */
  category: string
  opType: AuditOpType
  action: string
  target: string | null
  httpMethod: string | null
  path: string | null
  /** 请求参数 JSON（密码已打码、手机号已脱敏） */
  detail: string | null
  success: boolean
  errorCode: number | null
  errorMessage: string | null
  ip: string | null
  userAgent: string | null
  durationMs: number | null
  createdAt: string
}

// ==================== 代客下单 ====================

/** 点单菜单（与顾客端一致） */
export interface OrderingMenu {
  storeId: number
  categories: { id: number; name: string; dishes: MenuDish[] }[]
}

export interface MenuDish {
  id: number
  name: string
  description: string | null
  price: number
  image: string | null
  soldOut: boolean
  /** 限量菜品今日剩余；null 不限量 */
  remainingStock: number | null
  specGroups: { id: number; name: string; required: boolean; items: { id: number; name: string; priceDelta: number; isDefault: boolean }[] }[]
  addonGroups: { id: number; name: string; maxCount: number; items: { id: number; name: string; priceDelta: number }[] }[]
}

export interface PlaceOrderItem {
  dishId: number
  specItemIds: number[]
  addonItemIds: number[]
  quantity: number
}
