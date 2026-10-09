import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, DatePicker, Input, Space, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { listOrders } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import { PLATFORM } from '../../utils/orderStatus'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import MoneyText from '../../components/MoneyText'
import { OrderRefundTag, OrderStatusTag } from '../../components/StatusTag'
import OrderDetailDrawer from './OrderDetailDrawer'
import Panel, { PageToolbar } from '../../components/Panel'
import { ignoreShownError } from '../../utils/errors'
import { useIsKitchen } from '../../utils/auth'

const PAGE_SIZE = 20

/** 状态页签：key 为逗号分隔的后端状态 */
/** 「取消申请」页签：按取消申请筛选，而不是按订单状态 */
const CANCEL_TAB = 'CANCEL_REQUEST'
/** 「未结账」页签：先吃后付、还没结账的订单 */
const UNSETTLED_TAB = 'UNSETTLED'

const TABS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'PAID', label: '待接单' },
  { key: CANCEL_TAB, label: '取消申请' },
  { key: UNSETTLED_TAB, label: '未结账' },
  { key: 'MAKING', label: '待制作 / 制作中' },
  { key: 'READY', label: '待送餐' },
  { key: 'DONE', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
  { key: 'PENDING_PAY,CLOSED', label: '未支付' },
]

/** 订单管理：按状态筛选、搜索订单号 / 桌号、按日期过滤；点击查看详情并操作 */
export default function OrdersPage() {
  // 后厨只读：可以查看订单与详情，不能接单 / 拒单 / 送达等任何操作（后端同样会拒绝）
  const isKitchen = useIsKitchen()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [keyword, setKeyword] = useState('')
  const [date, setDate] = useState<Dayjs | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: OrderSummary[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
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

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listOrders({
        status: status && status !== CANCEL_TAB && status !== UNSETTLED_TAB ? status : undefined,
        cancelRequest: status === CANCEL_TAB ? 'APPLYING' : undefined,
        unsettled: status === UNSETTLED_TAB || undefined,
        keyword: keyword || undefined,
        date: date ? date.format('YYYY-MM-DD') : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      if (isLatest()) setData({ list: res.list, total: res.total })
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [status, keyword, date, page, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  // 轮询到新订单时自动刷新列表
  useEffect(() => {
    if (newArrived > 0) {
      consumeNew()
      void load()
    }
  }, [newArrived, consumeNew, load])

  // 顾客申请取消 / 后厨出餐等由别人引起的变化：计数变了就刷新，列表里的「顾客申请取消」「待送餐」保持最新
  const countKey = counts ? `${counts.cancelRequestCount ?? 0}-${counts.readyCount ?? 0}-${counts.makingCount}-${counts.unsettledCount ?? 0}` : ''
  useEffect(() => {
    if (countKey) void load()
    // load 变化时上面的 effect 已加载过，这里只跟随计数变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countKey])

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

  const columns: ColumnsType<OrderSummary> = [
    {
      title: '桌号',
      dataIndex: 'tableCode',
      width: 80,
      render: (v: string | null) => <Typography.Text strong style={{ fontSize: 16 }}>{v ?? '-'}</Typography.Text>,
    },
    {
      title: '订单',
      width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text style={{ fontSize: 12 }}>{r.orderNo}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.createdAt).format('MM-DD HH:mm')} · {r.payMode === 'PAY_LATER' ? (r.paidAt ? '先吃后付·已结账' : '先吃后付') : PLATFORM[r.platform]} · {r.peopleCount} 人
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '菜品',
      render: (_, r) => (
        <Typography.Text ellipsis style={{ maxWidth: 320, display: 'inline-block' }}>
          {r.items.map((i) => `${i.dishName}${i.specDesc ? `(${i.specDesc})` : ''}×${i.quantity}`).join('、')}
        </Typography.Text>
      ),
    },
    { title: '金额', dataIndex: 'payAmount', width: 100, align: 'right', render: (v: number, r) => (
      <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
        <MoneyText fen={v} strong />
        {r.refundedAmount > 0 && <Typography.Text type="danger" style={{ fontSize: 12 }}>已退 ¥{(r.refundedAmount / 100).toFixed(2)}</Typography.Text>}
      </Space>
    ) },
    {
      title: '状态',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          {/* 接单后先是「待制作」，后厨点开始制作后才是「制作中」 */}
          <Space size={4} wrap>
            <OrderStatusTag status={r.status} cookingStartedAt={r.cookingStartedAt} />
            <OrderRefundTag status={r.refundStatus} />
            {r.status === 'MAKING' && r.cancelRequestStatus === 'APPLYING' && <Tag color="error">顾客申请取消</Tag>}
            {r.source === 'MERCHANT' && <Tag color="purple">前厅代客</Tag>}
            {r.payMode === 'PAY_LATER' && !r.paidAt && r.status !== 'CANCELLED' && r.status !== 'CLOSED' && <Tag color="gold">未结账</Tag>}
          </Space>
          {r.status === 'MAKING' && r.cookingStartedAt && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.cookingStartedAt).format('HH:mm')} 开始制作</Typography.Text>
          )}
        </Space>
      ),
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string | null) => v || <Typography.Text type="secondary">-</Typography.Text> },
    { title: '操作', width: 80, render: (_, r) => <Button type="link" size="small" onClick={() => openDetail(r.orderNo)}>详情</Button> },
  ]

  const tabLabel = (t: { key: string; label: string }) => {
    const n = t.key === 'PAID' ? counts?.pendingAcceptCount : t.key === 'MAKING' ? counts?.makingCount : t.key === 'READY' ? counts?.readyCount : t.key === CANCEL_TAB ? counts?.cancelRequestCount : t.key === UNSETTLED_TAB ? counts?.unsettledCount : 0
    return n ? <Badge count={n} size="small" offset={[8, -2]}>{t.label}</Badge> : t.label
  }

  return (
    <div>
      <Tabs
        activeKey={status}
        tabBarStyle={{ marginBottom: 16 }}
        onChange={(k) => { setPage(1); const next = new URLSearchParams(params); if (k) { next.set('status', k) } else { next.delete('status') } setParams(next, { replace: true }) }}
        items={TABS.map((t) => ({ key: t.key, label: tabLabel(t) }))}
      />
      <PageToolbar extra={<Button size="large" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>}>
        <Input.Search size="large" allowClear placeholder="订单号 / 桌号" style={{ width: 320, maxWidth: '100%' }} onSearch={(v) => { setKeyword(v.trim()); setPage(1) }} />
        <DatePicker size="large" value={date} onChange={(d) => { setDate(d); setPage(1) }} placeholder="下单日期" allowClear />
        {isKitchen && <Tag style={{ marginInlineEnd: 0 }}>后厨账号仅可查看</Tag>}
        {!isKitchen && <Button size="large" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>代客下单</Button>}
      </PageToolbar>
      <Panel>
        <Table<OrderSummary>
          rowKey="id"
          size="middle"
          scroll={{ x: 'max-content' }}
          loading={loading}
          columns={columns}
          dataSource={data.list}
          onRow={(r) => ({ onClick: () => openDetail(r.orderNo), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: data.total, onChange: setPage, showTotal: (t) => `共 ${t} 单` }}
        />
      </Panel>
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => openDetail(null)} onChanged={() => void load()} readOnly={isKitchen} />
    </div>
  )
}
