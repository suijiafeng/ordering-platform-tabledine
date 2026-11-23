import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, App, Button, DatePicker, Dropdown, Input, Space, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ClockCircleOutlined, DownOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { acceptOrder, deliverOrder, listOrders } from '../../api/order'
import type { NewOrderCount, OrderDetail, OrderSummary } from '../../api/types'
import { PLATFORM } from '../../utils/orderStatus'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import MoneyText from '../../components/MoneyText'
import ConfirmButton from '../../components/ConfirmButton'
import { OrderRefundTag, OrderStatusTag } from '../../components/StatusTag'
import OrderDetailDrawer from './OrderDetailDrawer'
import Panel from '../../components/Panel'
import ResponsiveTable from '../../components/ResponsiveTable'
import { ignoreShownError } from '../../utils/errors'
import { useIsKitchen } from '../../utils/auth'
import { useVisiblePolling } from '../../hooks/useVisiblePolling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useOrderEvents } from '../../store/orderEvents'

const PAGE_SIZE = 20

/** 页签 key：后端状态（逗号分隔）或下面几个特殊筛选 */
/** 「进行中」：待接单 + 制作中 + 待送餐，默认页签 */
export const ACTIVE_TAB = 'ACTIVE'
const ACTIVE_STATUSES = 'PAID,MAKING,READY'
/** 「全部」 */
export const ALL_TAB = 'ALL'
/** 「取消申请」页签：按取消申请筛选，而不是按订单状态 */
const CANCEL_TAB = 'CANCEL_REQUEST'
/** 「未结账」页签：先吃后付、还没结账的订单 */
const UNSETTLED_TAB = 'UNSETTLED'

interface TabDef {
  key: string
  label: string
  /** 计数取自轮询接口；hot = 需要马上处理，计数用主色 */
  count?: (c: NewOrderCount) => number
  hot?: boolean
}

export const TABS: TabDef[] = [
  { key: ACTIVE_TAB, label: '进行中', count: (c) => c.pendingAcceptCount + c.makingCount + (c.readyCount ?? 0), hot: true },
  { key: 'PAID', label: '待接单', count: (c) => c.pendingAcceptCount, hot: true },
  { key: 'MAKING', label: '制作中', count: (c) => c.makingCount },
  { key: 'READY', label: '待送餐', count: (c) => c.readyCount ?? 0 },
  { key: CANCEL_TAB, label: '取消申请', count: (c) => c.cancelRequestCount ?? 0, hot: true },
  { key: UNSETTLED_TAB, label: '未结账', count: (c) => c.unsettledCount ?? 0 },
  { key: 'DONE', label: '已完成' },
  { key: ALL_TAB, label: '全部' },
]
/** 不常用的状态收进「更多状态」 */
export const MORE_TABS: TabDef[] = [
  { key: 'CANCELLED', label: '已取消' },
  { key: 'PENDING_PAY,CLOSED', label: '未支付' },
]

/** 页签 → 列表接口参数 */
export function tabQuery(tab: string): { status?: string; cancelRequest?: 'APPLYING'; unsettled?: boolean } {
  if (tab === ACTIVE_TAB) return { status: ACTIVE_STATUSES }
  if (tab === ALL_TAB) return {}
  if (tab === CANCEL_TAB) return { cancelRequest: 'APPLYING' }
  if (tab === UNSETTLED_TAB) return { unsettled: true }
  return { status: tab }
}

/** 先吃后付、还没结账（已取消 / 已关闭的不算） */
function isUnsettledRow(r: OrderSummary): boolean {
  return r.payMode === 'PAY_LATER' && !r.paidAt && r.status !== 'CANCELLED' && r.status !== 'CLOSED'
}

/** 订单管理：按状态筛选、搜索订单号 / 桌号、按日期过滤；点击查看详情并操作 */
export default function OrdersPage() {
  // 后厨只读：可以查看订单与详情，不能接单 / 拒单 / 送达等任何操作（后端同样会拒绝）
  const isKitchen = useIsKitchen()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // 没带 status 时默认「进行中」；旧链接 status= 空串视为「全部」
  const rawStatus = params.get('status')
  const status = rawStatus === null ? ACTIVE_TAB : rawStatus === '' ? ALL_TAB : rawStatus
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const [actingNo, setActingNo] = useState<string | null>(null)
  const orderEvents = useOrderEvents((s) => s.version)
  const [keyword, setKeyword] = useState('')
  const [searchText, setSearchText] = useState('')
  const [date, setDate] = useState<Dayjs | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: OrderSummary[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [detail, setDetail] = useState<string | null>(params.get('orderNo'))
  // 页面已打开时地址栏 orderNo 变化（如点击新订单弹窗跳转）也要打开对应详情
  const paramOrderNo = params.get('orderNo')
  useEffect(() => {
    if (paramOrderNo) setDetail(paramOrderNo)
  }, [paramOrderNo])
  const counts = usePollStore((s) => s.counts)
  const newArrived = usePollStore((s) => s.newArrived)
  const consumeNew = usePollStore((s) => s.consumeNew)

  const beginLoad = useLatestRequest()

  const load = useCallback(async (background = false) => {
    const isLatest = beginLoad()
    if (!background) setLoading(true)
    try {
      const res = await listOrders({
        ...tabQuery(status),
        keyword: keyword || undefined,
        date: date ? date.format('YYYY-MM-DD') : undefined,
        page,
        pageSize: PAGE_SIZE,
      }, background ? { silent: true } : undefined)
      if (isLatest()) {
        setData({ list: res.list, total: res.total })
        setSyncFailed(false)
      }
    } catch (e) {
      if (isLatest()) setSyncFailed(true)
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [status, keyword, date, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])
  useVisiblePolling(() => load(true))

  // 新订单横幅里接单后静默刷新
  useEffect(() => {
    if (orderEvents > 0) void load(true)
  }, [orderEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // 轮询到新订单时自动刷新列表
  useEffect(() => {
    if (newArrived > 0) {
      consumeNew()
      void load(true)
    }
  }, [newArrived, consumeNew, load])

  const openDetail = (orderNo: string | null) => {
    setDetail(orderNo)
    const next = new URLSearchParams(params)
    if (orderNo) {
      next.set('orderNo', orderNo)
    } else {
      next.delete('orderNo')
    }
    setParams(next, { replace: true })
  }

  /** 列表里的快捷操作（接单 / 送达）：成功后静默刷新，失败由请求层提示 */
  const quickAction = async (r: OrderSummary, fn: (no: string) => Promise<OrderDetail>, ok: string) => {
    setActingNo(r.orderNo)
    try {
      await fn(r.orderNo)
      message.success(`${ok}${r.tableCode ? ` · ${r.tableCode} 桌` : ''}`)
      void load(true)
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setActingNo(null)
    }
  }

  /** 每行一个主操作：待接单→接单、待送餐→送达、取消申请→处理申请、未结账→结账；其余只有详情 */
  const primaryAction = (r: OrderSummary) => {
    if (isKitchen) return null
    const busy = actingNo === r.orderNo
    const size = isMobile ? 'large' as const : 'small' as const
    if (r.status === 'PAID') {
      return <ConfirmButton type="primary" size={size} block={isMobile} loading={busy} confirmText={`确认接单${r.tableCode ? `（${r.tableCode} 桌）` : ''}？`} onConfirm={() => void quickAction(r, acceptOrder, '已接单')}>接单</ConfirmButton>
    }
    if (r.status === 'MAKING' && r.cancelRequestStatus === 'APPLYING') {
      return <Button size={size} block={isMobile} danger onClick={(e) => { e.stopPropagation(); openDetail(r.orderNo) }}>处理申请</Button>
    }
    if (isUnsettledRow(r)) {
      return <Button size={size} block={isMobile} color="gold" variant="solid" onClick={(e) => { e.stopPropagation(); openDetail(r.orderNo) }}>结账</Button>
    }
    if (r.status === 'READY') {
      return <ConfirmButton size={size} block={isMobile} color="blue" variant="solid" loading={busy} confirmText={`确认送达${r.tableCode ? `（${r.tableCode} 桌）` : ''}？`} onConfirm={() => void quickAction(r, deliverOrder, '已送达')}>送达</ConfirmButton>
    }
    return null
  }

  const columns: ColumnsType<OrderSummary> = [
    {
      title: '桌号',
      dataIndex: 'tableCode',
      width: 72,
      render: (v: string | null) => <Typography.Text strong style={{ fontSize: 16 }}>{v ?? '-'}</Typography.Text>,
    },
    {
      title: '订单',
      width: 190,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text className="order-no">{r.orderNo}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.createdAt).format('MM-DD HH:mm')} · {r.payMode === 'PAY_LATER' ? (r.paidAt ? '先吃后付·已结账' : '先吃后付') : PLATFORM[r.platform]} · {r.peopleCount} 人
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '菜品',
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ maxWidth: 360 }}>
          <Typography.Text ellipsis={{ tooltip: true }} style={{ maxWidth: 360 }}>
            {r.items.map((i) => `${i.dishName}${i.specDesc ? `(${i.specDesc})` : ''} ×${i.quantity}`).join('、') || '-'}
          </Typography.Text>
          {r.remark && <Typography.Text ellipsis={{ tooltip: r.remark }} style={{ fontSize: 12, color: '#D97706', maxWidth: 360 }}>备注：{r.remark}</Typography.Text>}
        </Space>
      ),
    },
    { title: '金额', dataIndex: 'payAmount', width: 110, align: 'right', render: (v: number, r) => (
      <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
        <MoneyText fen={v} strong />
        {r.refundedAmount > 0 && <Typography.Text type="danger" style={{ fontSize: 12 }}>已退 ¥{(r.refundedAmount / 100).toFixed(2)}</Typography.Text>}
      </Space>
    ) },
    {
      title: '状态',
      width: 220,
      render: (_, r) => {
        const waited = r.status === 'PAID' && r.paidAt ? Math.max(0, dayjs().diff(dayjs(r.paidAt), 'minute')) : null
        return (
          <Space direction="vertical" size={2}>
            {/* 接单后先是「待制作」，后厨点开始制作后才是「制作中」 */}
            <Space size={4} wrap>
              <OrderStatusTag status={r.status} cookingStartedAt={r.cookingStartedAt} />
              {waited !== null && <Tag color={waited >= 3 ? 'error' : 'default'} icon={<ClockCircleOutlined />}>{waited < 1 ? '刚刚' : `${waited} 分钟`}</Tag>}
              <OrderRefundTag status={r.refundStatus} />
              {r.status === 'MAKING' && r.cancelRequestStatus === 'APPLYING' && <Tag color="error">顾客申请取消</Tag>}
              {r.source === 'MERCHANT' && <Tag color="purple">前厅代客</Tag>}
              {isUnsettledRow(r) && <Tag color="gold">未结账</Tag>}
            </Space>
            {r.status === 'MAKING' && r.cookingStartedAt && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.cookingStartedAt).format('HH:mm')} 开始制作</Typography.Text>
            )}
          </Space>
        )
      },
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      align: 'right',
      render: (_, r) => {
        const main = primaryAction(r)
        const detailBtn = <Button size={isMobile ? 'large' : 'small'} block={isMobile} onClick={(e) => { e.stopPropagation(); openDetail(r.orderNo) }}>详情</Button>
        // 手机：整行大按钮，左「详情」右主操作（主操作更宽，便于单手点按）
        if (isMobile) {
          return (
            <div className="td-card-actions" style={{ gridTemplateColumns: main ? '1fr 2fr' : '1fr' }}>
              {detailBtn}
              {main}
            </div>
          )
        }
        return (
          <Space size={6}>
            {main}
            {detailBtn}
          </Space>
        )
      },
    },
  ]

  /** 手机订单卡片（R4 设计稿）：桌号块 + 状态 / 时间 + 金额，下一行菜品与备注 */
  const renderOrderCard = (r: OrderSummary, cell: (title: string) => ReactNode) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="td-table-badge">{r.tableCode ?? '外带'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {cell('状态')}
        </div>
        <div style={{ textAlign: 'right' }}>{cell('金额')}</div>
      </div>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 6 }}>
        {dayjs(r.createdAt).format('HH:mm')} · {r.payMode === 'PAY_LATER' ? (r.paidAt ? '先吃后付·已结账' : '先吃后付') : PLATFORM[r.platform]} · {r.peopleCount} 人 · <span className="order-no">{r.orderNo}</span>
      </Typography.Text>
      <div style={{ marginTop: 8 }}>
        {r.items.map((i) => `${i.dishName}${i.specDesc ? `(${i.specDesc})` : ''} ×${i.quantity}`).join('、') || '-'}
      </div>
      {r.remark && <div style={{ fontSize: 12, color: '#D97706' }}>备注：{r.remark}</div>}
    </div>
  )

  const countOf = (t: TabDef) => (counts && t.count ? t.count(counts) : 0)
  const tabLabel = (t: TabDef) => {
    const n = countOf(t)
    return (
      <span>
        {t.label}
        {n > 0 && <span className={`td-tab-count${t.hot ? ' is-hot' : ''}`}>{n}</span>}
      </span>
    )
  }
  const switchTab = (k: string) => {
    setPage(1)
    const next = new URLSearchParams(params)
    if (k === ACTIVE_TAB) next.delete('status')
    else next.set('status', k)
    next.delete('orderNo')
    setParams(next, { replace: true })
  }
  const moreActive = MORE_TABS.find((t) => t.key === status)
  const tabItems = [...TABS, ...(moreActive ? [moreActive] : [])].map((t) => ({ key: t.key, label: tabLabel(t) }))
  const resetFilters = () => { setKeyword(''); setSearchText(''); setDate(null); setPage(1) }
  const filtered = keyword !== '' || date !== null

  const syncAlert = syncFailed && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="订单同步暂时中断，当前显示上次结果，恢复后会自动更新。" action={<Button size="small" onClick={() => void load()}>重试</Button>} />
  const table = (
    <ResponsiveTable<OrderSummary>
      rowKey="id"
      size="middle"
      scrollX={1080}
      loading={loading}
      columns={columns}
      dataSource={data.list}
      renderCard={renderOrderCard}
      onRow={(r) => ({ onClick: () => openDetail(r.orderNo), style: { cursor: 'pointer' } })}
      pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showTotal: (t) => `共 ${t} 单`, style: { paddingInline: 20 } }}
    />
  )

  if (isMobile) {
    // 手机：搜索 + 横向滑动的状态胶囊，下面是订单卡片；代客下单在顶栏「＋」
    return (
      <div>
        {syncAlert}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Input.Search
            allowClear
            placeholder="订单号 / 桌号"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); if (!e.target.value) { setKeyword(''); setPage(1) } }}
            onSearch={(v) => { setKeyword(v.trim()); setPage(1) }}
            style={{ flex: 1 }}
          />
          <DatePicker value={date} onChange={(d) => { setDate(d); setPage(1) }} placeholder="日期" allowClear inputReadOnly style={{ width: 118 }} />
        </div>
        <div className="td-chips" role="tablist" aria-label="订单状态">
          {[...TABS, ...MORE_TABS].map((t) => {
            const n = countOf(t)
            const on = t.key === status
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} className={`td-chip${on ? ' is-on' : ''}`} onClick={() => switchTab(t.key)}>
                {t.label}{n > 0 && <span className={`td-chip-n${t.hot ? ' is-hot' : ''}`}>{n}</span>}
              </button>
            )
          })}
        </div>
        {isKitchen && <Tag style={{ marginBottom: 10 }}>后厨账号仅可查看</Tag>}
        {table}
        <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => openDetail(null)} onChanged={() => void load()} readOnly={isKitchen} />
      </div>
    )
  }

  return (
    <div>
      {syncAlert}
      <Panel padding={0} style={{ overflow: 'hidden' }}>
        <div className="td-orders-card">
          <Tabs
            activeKey={status}
            onChange={switchTab}
            items={tabItems}
            tabBarExtraContent={{
              right: (
                <Dropdown
                  trigger={['click']}
                  menu={{ items: MORE_TABS.map((t) => ({ key: t.key, label: t.label })), selectable: true, selectedKeys: moreActive ? [moreActive.key] : [], onClick: ({ key }) => switchTab(key) }}
                >
                  <Button type="text" size="small">更多状态 <DownOutlined /></Button>
                </Dropdown>
              ),
            }}
          />
          <div className="td-orders-filters">
            <Input.Search
              allowClear
              placeholder="订单号 / 桌号"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); if (!e.target.value) { setKeyword(''); setPage(1) } }}
              style={{ width: 220 }}
              onSearch={(v) => { setKeyword(v.trim()); setPage(1) }}
            />
            <DatePicker value={date} onChange={(d) => { setDate(d); setPage(1) }} placeholder="下单日期" allowClear style={{ width: 140 }} />
            {filtered && <Button type="link" onClick={resetFilters}>重置</Button>}
            {isKitchen && <Tag style={{ marginInlineEnd: 0 }}>后厨账号仅可查看</Tag>}
            <span className="td-spacer" />
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
            {!isKitchen && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>代客下单</Button>}
          </div>
          {table}
        </div>
      </Panel>
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => openDetail(null)} onChanged={() => void load()} readOnly={isKitchen} />
    </div>
  )
}
