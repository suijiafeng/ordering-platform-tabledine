import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, DatePicker, Input, Space, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { listOrders } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import { PLATFORM } from '../../utils/orderStatus'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import MoneyText from '../../components/MoneyText'
import { OrderRefundTag, OrderStatusTag } from '../../components/StatusTag'
import OrderDetailDrawer from './OrderDetailDrawer'
import { ignoreShownError } from '../../utils/errors'

const PAGE_SIZE = 20

/** 状态页签：key 为逗号分隔的后端状态 */
const TABS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'PAID', label: '待接单' },
  { key: 'MAKING', label: '制作中' },
  { key: 'READY', label: '待送餐' },
  { key: 'DONE', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
  { key: 'PENDING_PAY,CLOSED', label: '未支付' },
]

/** 订单管理：按状态筛选、搜索订单号 / 桌号、按日期过滤；点击查看详情并操作 */
export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [keyword, setKeyword] = useState('')
  const [date, setDate] = useState<Dayjs | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ list: OrderSummary[]; total: number }>({ list: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<string | null>(params.get('orderNo'))
  const counts = usePollStore((s) => s.counts)
  const newArrived = usePollStore((s) => s.newArrived)
  const consumeNew = usePollStore((s) => s.consumeNew)

  const beginLoad = useLatestRequest()

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    setLoading(true)
    try {
      const res = await listOrders({
        status: status || undefined,
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
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text style={{ fontSize: 12 }}>{r.orderNo}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.createdAt).format('MM-DD HH:mm')} · {PLATFORM[r.platform]} · {r.peopleCount} 人
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
    { title: '状态', width: 150, render: (_, r) => <Space size={4}><OrderStatusTag status={r.status} /><OrderRefundTag status={r.refundStatus} /></Space> },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string | null) => v || <Typography.Text type="secondary">-</Typography.Text> },
    { title: '操作', width: 80, render: (_, r) => <Button type="link" size="small" onClick={() => openDetail(r.orderNo)}>详情</Button> },
  ]

  const tabLabel = (t: { key: string; label: string }) => {
    const n = t.key === 'PAID' ? counts?.pendingAcceptCount : t.key === 'MAKING' ? counts?.makingCount : 0
    return n ? <Badge count={n} size="small" offset={[8, -2]}>{t.label}</Badge> : t.label
  }

  return (
    <Card
      title="订单管理"
      extra={
        <Space wrap>
          <Input.Search allowClear placeholder="订单号 / 桌号" style={{ width: 180 }} onSearch={(v) => { setKeyword(v.trim()); setPage(1) }} />
          <DatePicker value={date} onChange={(d) => { setDate(d); setPage(1) }} placeholder="下单日期" allowClear />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
        </Space>
      }
    >
      <Tabs
        activeKey={status}
        onChange={(k) => { setPage(1); const next = new URLSearchParams(params); if (k) { next.set('status', k) } else { next.delete('status') } setParams(next, { replace: true }) }}
        items={TABS.map((t) => ({ key: t.key, label: tabLabel(t) }))}
      />
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
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => openDetail(null)} onChanged={() => void load()} />
    </Card>
  )
}
