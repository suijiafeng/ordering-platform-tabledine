import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Empty, Segmented, Skeleton, Tag, Typography } from 'antd'
import { ClockCircleOutlined, DownloadOutlined, PlusOutlined, QrcodeOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fetchStore } from '../../api/store'
import { exportReport, fetchDashboard } from '../../api/report'
import { acceptOrder, kitchenQueue, listOrders } from '../../api/order'
import { listRefunds } from '../../api/refund'
import { listTables } from '../../api/table'
import type { DashboardToday, OrderSummary, RefundView, StoreDetail, TableItem } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { useIsOwner } from '../../utils/auth'
import { usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useVisiblePolling } from '../../hooks/useVisiblePolling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ignoreShownError } from '../../utils/errors'
import { useAuthStore } from '../../store/auth'
import { useOrderEvents } from '../../store/orderEvents'
import SyncStatus from '../../components/SyncStatus'
import ConfirmButton from '../../components/ConfirmButton'
import HourlyTrendChart from '../../components/HourlyTrendChart'
import Sparkline from '../../components/Sparkline'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'
import { summarizeItems } from '../../components/NewOrderBanner'
import { changeRate, chartHours, greeting, hourlySeries, prepStats, tableStates } from './dashboardData'
import '../../styles/dashboard.css'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 拉取某天全部订单（最多 5 页 × 100 单），用于分时趋势和出餐用时 */
async function ordersOfDay(date: string): Promise<OrderSummary[]> {
  const all: OrderSummary[] = []
  for (let page = 1; page <= 5; page++) {
    const res = await listOrders({ date, page, pageSize: 100 }, { silent: true })
    all.push(...res.list)
    if (all.length >= res.total || res.list.length === 0) break
  }
  return all
}

function waitMinutes(o: OrderSummary): number {
  return Math.max(0, dayjs().diff(dayjs(o.paidAt ?? o.createdAt), 'minute'))
}

function WaitTag({ order }: { order: OrderSummary }) {
  const m = waitMinutes(order)
  return <Tag color={m >= 3 ? 'error' : 'default'} icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>{m < 1 ? '等待 刚刚' : `等待 ${m} 分钟`}</Tag>
}

/** 工作台（R4）：今日 KPI、分时趋势、待处理、后厨队列、热销、桌台状态；手机上改为概览卡 + 待接单卡片 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const isOwner = useIsOwner()
  const isMobile = useIsMobile()
  const { message } = App.useApp()
  const staffName = useAuthStore((s) => s.staff?.name ?? '')
  const counts = usePollStore((s) => s.counts)
  const bump = useOrderEvents((s) => s.bump)
  const orderEvents = useOrderEvents((s) => s.version)

  const [store, setStore] = useState<StoreDetail | null>(null)
  const [stats, setStats] = useState<DashboardToday | null>(null)
  const [pending, setPending] = useState<OrderSummary[]>([])
  const [cancelReqs, setCancelReqs] = useState<OrderSummary[]>([])
  const [refunds, setRefunds] = useState<RefundView[]>([])
  const [kitchen, setKitchen] = useState<OrderSummary[]>([])
  const [active, setActive] = useState<OrderSummary[]>([])
  const [tables, setTables] = useState<TableItem[]>([])
  const [today, setToday] = useState<OrderSummary[] | null>(null)
  const [yesterday, setYesterday] = useState<OrderSummary[]>([])
  const [failed, setFailed] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const [todoTab, setTodoTab] = useState<'PAID' | 'CANCEL' | 'REFUND'>('PAID')
  const [metric, setMetric] = useState<'amount' | 'orders'>('amount')
  const [detail, setDetail] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const beginLoad = useLatestRequest()

  /** 5 秒一次：KPI、待处理、后厨、在桌订单 */
  const load = useCallback(async (quiet = false) => {
    const isLatest = beginLoad()
    const opt = { silent: quiet }
    const [s, st, p, c, r, k, a, u] = await Promise.allSettled([
      fetchStore(opt),
      isOwner ? fetchDashboard(opt) : Promise.resolve(null),
      listOrders({ status: 'PAID', page: 1, pageSize: 20 }, { silent: true }),
      listOrders({ cancelRequest: 'APPLYING', page: 1, pageSize: 20 }, { silent: true }),
      isOwner ? listRefunds({ status: 'APPLYING', page: 1, pageSize: 20 }, { silent: true }) : Promise.resolve(null),
      kitchenQueue(),
      listOrders({ status: 'PAID,MAKING,READY', page: 1, pageSize: 100 }, { silent: true }),
      listOrders({ unsettled: true, page: 1, pageSize: 100 }, { silent: true }),
    ])
    if (!isLatest()) return
    if (s.status === 'fulfilled') setStore(s.value)
    if (st.status === 'fulfilled') { if (st.value) setStats(st.value); setStatsError(false) } else { setStatsError(true); ignoreShownError(st.reason) }
    if (p.status === 'fulfilled') setPending([...p.value.list].reverse())
    if (c.status === 'fulfilled') setCancelReqs(c.value.list)
    if (r.status === 'fulfilled' && r.value) setRefunds(r.value.list)
    if (k.status === 'fulfilled') setKitchen(k.value)
    if (a.status === 'fulfilled' && u.status === 'fulfilled') {
      const seen = new Set(a.value.list.map((o) => o.id))
      setActive([...a.value.list, ...u.value.list.filter((o) => !seen.has(o.id))])
    }
    setFailed([s, p, k].some((x) => x.status === 'rejected'))
  }, [isOwner, beginLoad])

  /** 30 秒一次：今日全部订单（分时趋势、出餐用时） */
  const loadToday = useCallback(async () => {
    try {
      setToday(await ordersOfDay(dayjs().format('YYYY-MM-DD')))
    } catch (e) {
      ignoreShownError(e)
      setToday((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadToday() }, [loadToday])
  useEffect(() => {
    listTables({ silent: true }).then(setTables).catch(ignoreShownError)
    if (isOwner) ordersOfDay(dayjs().subtract(1, 'day').format('YYYY-MM-DD')).then(setYesterday).catch(ignoreShownError)
  }, [isOwner])
  useEffect(() => { if (orderEvents > 0) void load(true) }, [orderEvents, load])
  useVisiblePolling(() => load(true))
  useVisiblePolling(loadToday, { intervalMs: 30_000 })

  const accept = async (o: OrderSummary) => {
    setActing(o.orderNo)
    try {
      await acceptOrder(o.orderNo)
      message.success(`已接单${o.tableCode ? ` · ${o.tableCode} 桌` : ''}`)
      bump()
      void load(true)
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setActing(null)
    }
  }
  const exportToday = async () => {
    const d = dayjs().format('YYYY-MM-DD')
    setExporting(true)
    try { await exportReport(d, d) } catch (e) { ignoreShownError(e) } finally { setExporting(false) }
  }

  // ---------- 派生数据 ----------
  const nowHour = dayjs().hour()
  const [fromH, toH] = useMemo(() => chartHours(store?.businessHours, [...(today ?? []), ...yesterday]), [store?.businessHours, today, yesterday])
  const todaySeries = useMemo(() => hourlySeries(today ?? [], fromH, toH), [today, fromH, toH])
  const ySeries = useMemo(() => hourlySeries(yesterday, fromH, toH), [yesterday, fromH, toH])
  // 「较昨日同时段」：只比到当前小时
  const ySoFar = ySeries.filter((p) => p.hour <= nowHour)
  const yAmountSoFar = ySoFar.reduce((s, p) => s + p.amount, 0)
  const yOrdersSoFar = ySoFar.reduce((s, p) => s + p.orders, 0)
  const prep = useMemo(() => prepStats(today ?? []), [today])
  const tableList = useMemo(() => tableStates(tables, active), [tables, active])
  const diningCount = tableList.filter((t) => t.state !== 'IDLE').length

  const pendingCount = counts?.pendingAcceptCount ?? pending.length
  const cancelCount = counts?.cancelRequestCount ?? cancelReqs.length
  const refundCount = isOwner ? (counts?.applyingRefundCount ?? refunds.length) : 0
  const oldestPending = pending[0]
  const waiting = kitchen.filter((o) => o.status === 'MAKING' && !o.cookingStartedAt && o.cancelRequestStatus !== 'APPLYING')
  const cooking = kitchen.filter((o) => o.status === 'MAKING' && !!o.cookingStartedAt)
  const readyList = active.filter((o) => o.status === 'READY')
  const net = stats?.netIncome ?? 0
  const orderCount = stats?.orderCount ?? 0
  const rate = changeRate(net, yAmountSoFar)
  const orderDelta = stats ? orderCount - yOrdersSoFar : 0
  const avgTicket = orderCount ? (stats?.paidAmount ?? 0) / orderCount : 0
  const daily = stats?.daily ?? []
  const refundSum = refunds.reduce((s, r) => s + r.amount, 0)
  const now = dayjs()
  const openState = store ? (store.businessStatus === 1 ? '营业中' : '已暂停营业') : ''

  const Rate = ({ v, suffix }: { v: number | null; suffix: string }) => v === null
    ? <span>{suffix.replace('较', '昨日同时段无数据，')}</span>
    : <span className={v >= 0 ? 'td-up' : 'td-down'}>{v >= 0 ? '▲' : '▼'} {Math.abs(v * 100).toFixed(1)}% <span style={{ color: 'var(--td-text-3)' }}>{suffix}</span></span>

  const todoItems = todoTab === 'PAID' ? pending : todoTab === 'CANCEL' ? cancelReqs : []
  const todoBody = todoTab === 'REFUND' ? (
    refunds.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有待审核的退款" /> : refunds.slice(0, 4).map((r) => (
      <div key={r.refundNo} className="td-todo">
        <span className="td-table-badge">{r.tableCode ?? '—'}</span>
        <div className="td-todo-main">
          <div className="td-line"><span className="td-money">{formatYuan(r.amount)}</span><Tag color="error" style={{ marginInlineEnd: 0 }}>退款待审</Tag></div>
          <div className="td-ellipsis">{r.reason}</div>
        </div>
        <Button size="small" onClick={() => navigate('/refunds?status=APPLYING')}>审核</Button>
      </div>
    ))
  ) : todoItems.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={todoTab === 'PAID' ? '没有待接单的订单' : '没有取消申请'} />
  ) : todoItems.slice(0, 4).map((o) => (
    <div key={o.orderNo} className="td-todo">
      <span className="td-table-badge">{o.tableCode ?? '外带'}</span>
      <div className="td-todo-main">
        <div className="td-line">
          <span className="td-money">{formatYuan(o.payAmount)}</span>
          {todoTab === 'PAID' ? <WaitTag order={o} /> : <Tag color="error" style={{ marginInlineEnd: 0 }}>顾客申请取消</Tag>}
        </div>
        <div className="td-ellipsis">{summarizeItems(o)}</div>
      </div>
      <Button size="small" onClick={() => setDetail(o.orderNo)}>{todoTab === 'PAID' ? '详情' : '处理'}</Button>
      {todoTab === 'PAID' && (
        <ConfirmButton size="small" type="primary" loading={acting === o.orderNo} confirmText={`确认接单${o.tableCode ? `（${o.tableCode} 桌）` : ''}？`} onConfirm={() => void accept(o)}>接单</ConfirmButton>
      )}
    </div>
  ))

  const todoCard = (
    <section className="td-card" aria-label="待处理">
      <div className="td-card-h">
        <h3>待处理</h3>
        {pendingCount + cancelCount + refundCount > 0 && <Tag color="error" style={{ marginInlineEnd: 0 }}>{pendingCount + cancelCount + refundCount}</Tag>}
        <span className="td-extra"><Button type="link" size="small" onClick={() => navigate('/orders')}>全部订单 <RightOutlined /></Button></span>
      </div>
      <div className="td-card-b" style={{ paddingTop: 12 }}>
        <Segmented
          size="small"
          value={todoTab}
          onChange={(v) => setTodoTab(v as typeof todoTab)}
          options={[
            { value: 'PAID', label: `待接单 ${pendingCount}` },
            { value: 'CANCEL', label: `取消申请 ${cancelCount}` },
            ...(isOwner ? [{ value: 'REFUND', label: `退款待审 ${refundCount}` }] : []),
          ]}
        />
        <div style={{ marginTop: 4 }}>{todoBody}</div>
      </div>
    </section>
  )

  const prepTotal = Math.max(1, prep.served)
  const kitchenCard = (
    <section className="td-card" aria-label="后厨队列">
      <div className="td-card-h">
        <h3>后厨队列</h3>
        <span className="td-muted">5 秒同步</span>
        <span className="td-extra"><Button type="link" size="small" onClick={() => navigate('/kitchen')}>打开后厨屏 <RightOutlined /></Button></span>
      </div>
      <div className="td-card-b">
        <div className="td-kq">
          <div className="td-kq-box">
            <div className="td-kq-top">待制作 <b>{waiting.length}</b></div>
            <div className={`td-kq-sub${waiting[0] && dayjs().diff(dayjs(waiting[0].acceptedAt ?? waiting[0].createdAt), 'minute') >= 10 ? ' is-warn' : ''}`}>
              {waiting[0] ? `最久 ${waiting[0].tableCode ?? ''} · ${dayjs().diff(dayjs(waiting[0].acceptedAt ?? waiting[0].createdAt), 'minute')} 分钟` : '暂无'}
            </div>
          </div>
          <div className="td-kq-box">
            <div className="td-kq-top">制作中 <b>{cooking.length}</b></div>
            <div className="td-kq-sub">{prep.avgMinutes !== null ? `平均出餐 ${prep.avgMinutes.toFixed(1)} 分钟` : '今日暂无出餐'}</div>
          </div>
          <div className="td-kq-box">
            <div className="td-kq-top">待送餐 <b>{readyList.length}</b></div>
            <div className="td-kq-sub" style={readyList[0] ? { color: '#D97706' } : undefined}>
              {readyList[0] ? `${readyList[0].tableCode ?? ''} 已等 ${dayjs().diff(dayjs(readyList[0].readyAt ?? readyList[0].createdAt), 'minute')} 分钟` : '暂无'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--td-text-2)' }}>
          今日出餐 <b style={{ color: 'var(--td-text)' }}>{prep.served}</b> 单 · 超时 <b style={{ color: prep.slow ? '#DC2626' : 'var(--td-text)' }}>{prep.slow}</b> 单 · 平均 <b style={{ color: 'var(--td-text)' }}>{prep.avgMinutes !== null ? prep.avgMinutes.toFixed(1) : '—'}</b> 分钟
        </div>
        <div className="td-stack" role="img" aria-label={`出餐用时分布：10 分钟内 ${prep.fast} 单，10 到 15 分钟 ${prep.normal} 单，超过 15 分钟 ${prep.slow} 单`}>
          <span style={{ width: `${(prep.fast / prepTotal) * 100}%`, background: '#16A34A' }} />
          <span style={{ width: `${(prep.normal / prepTotal) * 100}%`, background: '#D97706' }} />
          <span style={{ width: `${(prep.slow / prepTotal) * 100}%`, background: '#DC2626' }} />
        </div>
        <div className="td-legend">
          <span><i style={{ background: '#16A34A' }} />≤10 分钟 {prep.fast}</span>
          <span><i style={{ background: '#D97706' }} />10–15 分钟 {prep.normal}</span>
          <span><i style={{ background: '#DC2626' }} />超时 {prep.slow}</span>
        </div>
      </div>
    </section>
  )

  const top = stats?.topDishes ?? []
  const topMax = Math.max(1, ...top.map((d) => d.quantity))
  const hotList = top.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天还没有售出菜品" /> : top.slice(0, 5).map((d, i) => (
    <div key={d.dishName} className="td-hot">
      <span className={`td-rank${i < 3 ? ' is-top' : ''}`}>{i + 1}</span>
      <span className="td-dish-ph" style={i >= 3 ? { opacity: 0.75 } : undefined}>{d.dishName.slice(0, 1)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Typography.Text ellipsis>{d.dishName}</Typography.Text>
          <span style={{ fontSize: 12, color: 'var(--td-text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{d.quantity} 份 · {formatYuan(d.amount)}</span>
        </div>
        <div className="td-bar"><span style={{ width: `${(d.quantity / topMax) * 100}%`, opacity: i < 3 ? 1 : 0.4 }} /></div>
      </div>
    </div>
  ))
  const hotCard = (
    <section className="td-card" aria-label="今日热销">
      <div className="td-card-h">
        <h3>今日热销</h3>
        <span className="td-extra"><Button type="link" size="small" onClick={() => navigate('/reports')}>数据看板 <RightOutlined /></Button></span>
      </div>
      <div className="td-card-b" style={{ paddingTop: 8 }}>{stats || statsError ? hotList : <Skeleton active />}</div>
    </section>
  )

  const tableCard = (
    <section className="td-card" aria-label="桌台状态">
      <div className="td-card-h">
        <h3>桌台状态</h3>
        <span className="td-muted">用餐中 {diningCount} / 共 {tableList.length} 桌</span>
        <span className="td-extra"><Button type="link" size="small" onClick={() => navigate('/tables')}>桌台管理 <RightOutlined /></Button></span>
      </div>
      <div className="td-card-b">
        {tableList.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有桌台" /> : (
          <div className="td-tables">
            {tableList.map((t) => (
              <div key={t.code} className={`td-tile${t.state === 'DINING' ? ' is-dining' : t.state === 'PENDING' ? ' is-pending' : ''}`}>
                <b>{t.code}</b>
                {t.state === 'IDLE' ? '空闲' : t.state === 'PENDING' ? '待接单' : '用餐中'}
                {t.state !== 'IDLE' && <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatYuan(t.amount)}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="td-tile-legend">
          <span><i style={{ background: 'var(--td-primary)' }} />用餐中</span>
          <span><i style={{ background: '#D97706' }} />待接单</span>
          <span><i style={{ background: 'var(--td-text-3)' }} />空闲</span>
        </div>
      </div>
    </section>
  )

  const drawer = <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => { void load(true); bump() }} />
  const syncBanner = failed && <SyncStatus failed />

  // ---------- 手机 ----------
  if (isMobile) {
    return (
      <div className="td-dash">
        {syncBanner}
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{greeting(now.hour())}，{staffName}</h2>
          <div className="td-dash-sub">{store?.name}{store && <> · <span className={`td-dot${store.businessStatus === 1 ? '' : ' is-off'}`} /> {openState} {store.businessHours ?? ''}</>}</div>
        </div>
        {isOwner && (
          <div className="td-hero">
            <div className="td-hero-label">今日实收（元）</div>
            <div className="td-hero-value">{stats ? (net / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div>
            <div className="td-hero-sub">{rate === null ? '昨日同时段无数据' : `${rate >= 0 ? '▲' : '▼'} ${Math.abs(rate * 100).toFixed(1)}% 较昨日同时段`}</div>
            <div className="td-hero-grid">
              <div><b>{orderCount}</b><span>订单</span></div>
              <div><b>{formatYuan(Math.round(avgTicket))}</b><span>客单价</span></div>
              <div><b>{diningCount}/{tableList.length}</b><span>用餐桌台</span></div>
            </div>
          </div>
        )}
        <div className="td-mini">
          <button type="button" className={`td-card td-kpi${pendingCount ? ' is-alert' : ''}`} onClick={() => navigate('/orders?status=PAID')}>
            <span className="td-kpi-top">待接单</span>
            <span className="td-kpi-value" style={{ color: pendingCount ? '#DC2626' : undefined }}>{pendingCount}</span>
          </button>
          <button type="button" className="td-card td-kpi" onClick={() => navigate('/kitchen')}>
            <span className="td-kpi-top">后厨待制作</span>
            <span className="td-kpi-value">{waiting.length}</span>
          </button>
          {isOwner ? (
            <button type="button" className="td-card td-kpi" onClick={() => navigate('/refunds?status=APPLYING')}>
              <span className="td-kpi-top">退款待审</span>
              <span className="td-kpi-value" style={{ color: refundCount ? '#D97706' : undefined }}>{refundCount}</span>
            </button>
          ) : (
            <button type="button" className="td-card td-kpi" onClick={() => navigate('/orders?status=READY')}>
              <span className="td-kpi-top">待送餐</span>
              <span className="td-kpi-value">{readyList.length}</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 16 }}>待接单</b>
          {pendingCount > 0 && <Tag color="error" style={{ marginInlineEnd: 0 }}>{pendingCount}</Tag>}
          <Button type="link" size="small" style={{ marginLeft: 'auto' }} onClick={() => navigate('/orders?status=PAID')}>全部 <RightOutlined /></Button>
        </div>
        {pending.length === 0 ? <div className="td-card td-card-b"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有待接单的订单" /></div> : pending.slice(0, 3).map((o) => (
          <div key={o.orderNo} className="td-card td-card-b">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="td-table-badge">{o.tableCode ?? '外带'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="td-line" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag color="orange" style={{ marginInlineEnd: 0 }}>待接单</Tag><WaitTag order={o} /></div>
                <div style={{ fontSize: 12, color: 'var(--td-text-3)' }}>{dayjs(o.createdAt).format('HH:mm')} · {o.peopleCount} 人</div>
              </div>
              <span className="td-money" style={{ fontSize: 18 }}>{formatYuan(o.payAmount)}</span>
            </div>
            <div style={{ marginTop: 10 }}>{summarizeItems(o)}</div>
            {o.remark && <div style={{ fontSize: 12, color: '#D97706' }}>备注：{o.remark}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 12 }}>
              <Button size="large" onClick={() => setDetail(o.orderNo)}>详情</Button>
              <ConfirmButton size="large" type="primary" loading={acting === o.orderNo} confirmText={`确认接单${o.tableCode ? `（${o.tableCode} 桌）` : ''}？`} onConfirm={() => void accept(o)}>接单</ConfirmButton>
            </div>
          </div>
        ))}
        {isOwner && hotCard}
        {drawer}
      </div>
    )
  }

  // ---------- 桌面 / 平板 ----------
  return (
    <div className="td-dash">
      {syncBanner}
      <div className="td-dash-head">
        <div>
          <h2>{greeting(now.hour())}，{staffName}</h2>
          <div className="td-dash-sub">
            {now.format('M 月 D 日')} 周{WEEK[now.day()]}
            {store && <> · 营业时间 {store.businessHours ?? '未设置'} · <span className={`td-dot${store.businessStatus === 1 ? '' : ' is-off'}`} />{openState}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<QrcodeOutlined />} onClick={() => navigate('/tables/print')}>打印桌码</Button>
          {isOwner && <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportToday()}>导出今日流水</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>代客下单</Button>
        </div>
      </div>

      {statsError && !stats && <Alert type="error" showIcon message="今日概览加载失败" action={<Button size="small" onClick={() => void load()}>重试</Button>} />}

      <div className="td-kpis">
        {isOwner ? (
          <>
            <div className="td-card td-kpi">
              <span className="td-kpi-top">今日实收<Sparkline values={daily.map((d) => d.netIncome)} /></span>
              <span className="td-kpi-value">{stats ? (net / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}<small>元</small></span>
              <span className="td-kpi-foot">{stats && <Rate v={rate} suffix="较昨日同时段" />}</span>
            </div>
            <div className="td-card td-kpi">
              <span className="td-kpi-top">今日订单<Sparkline values={daily.map((d) => d.orderCount)} color="#2563EB" /></span>
              <span className="td-kpi-value">{stats ? orderCount : '—'}<small>单</small></span>
              <span className="td-kpi-foot">
                {stats && <><span className={orderDelta >= 0 ? 'td-up' : 'td-down'}>{orderDelta >= 0 ? '▲' : '▼'} {Math.abs(orderDelta)} 单</span> 客单价 {formatYuan(Math.round(avgTicket))}</>}
              </span>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="td-card td-kpi" onClick={() => navigate('/kitchen')}>
              <span className="td-kpi-top">后厨待制作 / 制作中</span>
              <span className="td-kpi-value">{waiting.length}<small>/ {cooking.length}</small></span>
              <span className="td-kpi-foot">{prep.avgMinutes !== null ? `今日平均出餐 ${prep.avgMinutes.toFixed(1)} 分钟` : '今日暂无出餐'}</span>
            </button>
            <button type="button" className="td-card td-kpi" onClick={() => navigate('/orders?status=READY')}>
              <span className="td-kpi-top">待送餐</span>
              <span className="td-kpi-value">{readyList.length}<small>单</small></span>
              <span className="td-kpi-foot">出餐后请尽快送到桌</span>
            </button>
          </>
        )}
        <button type="button" className={`td-card td-kpi${pendingCount ? ' is-alert' : ''}`} onClick={() => navigate('/orders?status=PAID')}>
          <span className="td-kpi-top">待接单{pendingCount > 0 && <Tag color="error" style={{ marginInlineEnd: 0 }}>需处理</Tag>}</span>
          <span className="td-kpi-value">{pendingCount}<small>单</small></span>
          <span className="td-kpi-foot">{oldestPending ? `最久已等 ${waitMinutes(oldestPending)} 分钟` : '暂无待接单'}</span>
        </button>
        {isOwner ? (
          <button type="button" className="td-card td-kpi" onClick={() => navigate('/refunds?status=APPLYING')}>
            <span className="td-kpi-top">退款待审</span>
            <span className="td-kpi-value">{refundCount}<small>笔</small></span>
            <span className="td-kpi-foot">{refundCount ? <>合计 {formatYuan(refundSum)}{(counts?.overdueRefundCount ?? 0) > 0 && <span className="td-down">· {counts?.overdueRefundCount} 笔超 2 小时</span>}</> : `今日已退 ${formatYuan(stats?.refundedAmount ?? 0)}`}</span>
          </button>
        ) : (
          <button type="button" className="td-card td-kpi" onClick={() => navigate('/orders?status=CANCEL_REQUEST')}>
            <span className="td-kpi-top">取消申请</span>
            <span className="td-kpi-value">{cancelCount}<small>单</small></span>
            <span className="td-kpi-foot">{(counts?.unsettledCount ?? 0) > 0 ? `${counts?.unsettledCount} 单先吃后付未结账` : '无未结账订单'}</span>
          </button>
        )}
      </div>

      <div className="td-row td-row-2">
        {isOwner ? (
          <section className="td-card" aria-label="今日趋势">
            <div className="td-card-h">
              <h3>今日{metric === 'amount' ? '实收' : '订单'}趋势</h3>
              <span className="td-muted">按小时 · 支付成功口径</span>
              <span className="td-extra">
                <span className="td-legend"><span><i style={{ background: 'var(--td-primary)' }} />今日</span><span><i className="is-line" />昨日</span></span>
                <Segmented size="small" value={metric} onChange={(v) => setMetric(v as typeof metric)} options={[{ value: 'amount', label: '实收' }, { value: 'orders', label: '订单数' }]} />
              </span>
            </div>
            <div className="td-card-b">
              {today === null ? <Skeleton active paragraph={{ rows: 6 }} /> : <HourlyTrendChart today={todaySeries} yesterday={ySeries} metric={metric} nowHour={nowHour} />}
            </div>
          </section>
        ) : kitchenCard}
        {todoCard}
      </div>

      {isOwner ? (
        <div className="td-row td-row-3">
          {kitchenCard}
          {hotCard}
          {tableCard}
        </div>
      ) : (
        tableCard
      )}
      {drawer}
    </div>
  )
}
