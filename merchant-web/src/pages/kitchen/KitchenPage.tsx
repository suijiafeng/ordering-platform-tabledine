import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Col, Empty, Row, Segmented, Select, Space, Switch, Tag, Typography, theme as antdTheme } from 'antd'
import { CheckOutlined, FireOutlined, SendOutlined, SoundOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { acceptOrder, deliverOrder, kitchenQueue, readyOrder } from '../../api/order'
import type { OrderStatus, OrderSummary } from '../../api/types'
import { playNewOrderSound, usePollStore } from '../../hooks/useOrderPoll'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'
import { ignoreShownError } from '../../utils/errors'

const REFRESH_MS = 5000
/** 超过这个时间仍未接单 / 未出餐 / 未送达，卡片高亮提醒 */
const OVERDUE_MIN: Record<string, number> = { PAID: 3, MAKING: 20, READY: 5 }

type View = 'ALL' | 'PAID' | 'MAKING' | 'READY'

function minutesSince(from: string | null): number {
  return from ? dayjs().diff(dayjs(from), 'minute') : 0
}

function elapsed(from: string | null): string {
  if (!from) return ''
  const m = minutesSince(from)
  return m < 1 ? '刚刚' : `${m} 分钟`
}

/**
 * 后厨队列：待接单 / 制作中 / 待送餐三种工作视图，大字体卡片，一键流转；5 秒自动刷新。
 * 长期值守界面：显示最后同步时间，断线明确提示，恢复后自动刷新，超时订单高亮，未接单持续提醒。
 */
export default function KitchenPage() {
  const { message } = App.useApp()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [view, setView] = useState<View>('ALL')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [failures, setFailures] = useState(0)
  const [, setTick] = useState(0)
  const { soundEnabled, setSoundEnabled, remindIntervalMs, setRemindInterval } = usePollStore()
  const { token } = antdTheme.useToken()
  const beginLoad = useLatestRequest()
  const wasOffline = useRef(false)

  const load = useCallback(async () => {
    const isLatest = beginLoad()
    try {
      const list = await kitchenQueue()
      if (!isLatest()) return
      setOrders(list)
      setLastSync(new Date())
      setFailures(0)
      if (wasOffline.current) {
        wasOffline.current = false
        message.success('已重新连接，队列已刷新')
      }
    } catch {
      if (!isLatest()) return
      setFailures((n) => n + 1)
      wasOffline.current = true
    }
  }, [beginLoad, message])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load()
        setTick((t) => t + 1)
      }
    }, REFRESH_MS)
    // 从后台切回来立刻刷新一次
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const act = async (o: OrderSummary) => {
    setActing(o.orderNo)
    try {
      if (o.status === 'PAID') {
        await acceptOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 已接单`)
      } else if (o.status === 'MAKING') {
        await readyOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 已出餐`)
      } else {
        await deliverOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 已送达`)
      }
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setActing(null)
      void load()
    }
  }

  const byStatus = (s: OrderStatus) => orders.filter((o) => o.status === s)
  const pending = byStatus('PAID')
  const making = byStatus('MAKING')
  const ready = byStatus('READY')
  const offline = failures > 0 && (lastSync === null || failures >= 2)

  const card = (o: OrderSummary) => {
    const s = o.status
    const since = s === 'PAID' ? o.paidAt : s === 'MAKING' ? o.acceptedAt : o.readyAt
    const overdue = minutesSince(since) >= (OVERDUE_MIN[s] ?? 999)
    const color = s === 'PAID' ? token.colorWarning : s === 'MAKING' ? token.colorPrimary : token.colorSuccess
    const label = s === 'PAID' ? '待接单' : s === 'MAKING' ? '制作中' : '待送餐'
    const stageText = s === 'PAID' ? `支付 ${elapsed(since)}` : s === 'MAKING' ? `制作 ${elapsed(since)}` : `出餐 ${elapsed(since)}`
    return (
      <Col key={o.id} xs={24} sm={12} xl={8} xxl={6}>
        <Card
          size="small"
          style={{
            borderTop: `4px solid ${overdue ? token.colorError : color}`,
            height: '100%',
            boxShadow: overdue ? `0 0 0 2px ${token.colorErrorBorder}` : undefined,
          }}
          styles={{ body: { padding: 16 } }}
          onClick={() => setDetail(o.orderNo)}
          hoverable
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Typography.Title level={2} style={{ margin: 0 }}>{o.tableCode ?? '-'}</Typography.Title>
            <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
              <Tag color={overdue ? 'error' : s === 'PAID' ? 'orange' : s === 'MAKING' ? 'processing' : 'success'} style={{ marginRight: 0 }}>
                {overdue ? `超时 · ${label}` : label}
              </Tag>
              <Typography.Text type={overdue ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{stageText}</Typography.Text>
            </Space>
          </Space>
          <div style={{ margin: '12px 0', fontSize: 18, lineHeight: 1.7 }}>
            {o.items.map((i) => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {i.dishName}
                  {(i.specDesc || i.addonDesc) && <Typography.Text type="secondary" style={{ fontSize: 14, marginLeft: 6 }}>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Typography.Text>}
                </span>
                <Typography.Text strong style={{ fontSize: 18 }}>×{i.quantity}</Typography.Text>
              </div>
            ))}
          </div>
          {o.remark && <Typography.Text type="warning" style={{ display: 'block', marginBottom: 8 }}>备注：{o.remark}</Typography.Text>}
          <Button
            type="primary"
            size="large"
            block
            danger={overdue}
            icon={s === 'PAID' ? <FireOutlined /> : s === 'MAKING' ? <CheckOutlined /> : <SendOutlined />}
            loading={acting === o.orderNo}
            onClick={(e) => { e.stopPropagation(); void act(o) }}
          >
            {s === 'PAID' ? '接单' : s === 'MAKING' ? '出餐' : '送达'}
          </Button>
        </Card>
      </Col>
    )
  }

  const section = (title: string, list: OrderSummary[], color: string) =>
    list.length > 0 && (
      <>
        <Typography.Text strong style={{ color }}>{title}（{list.length}）</Typography.Text>
        <Row gutter={[16, 16]}>{list.map(card)}</Row>
      </>
    )

  const visible = view === 'ALL' ? orders : byStatus(view)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space size="large" wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>后厨队列</Typography.Title>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { label: `全部 ${orders.length}`, value: 'ALL' },
              { label: `待接单 ${pending.length}`, value: 'PAID' },
              { label: `制作中 ${making.length}`, value: 'MAKING' },
              { label: `待送餐 ${ready.length}`, value: 'READY' },
            ]}
          />
          <Typography.Text type={offline ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
            {offline ? '连接中断，正在重试…' : lastSync ? `最后同步 ${dayjs(lastSync).format('HH:mm:ss')} · 每 5 秒刷新` : '正在连接…'}
          </Typography.Text>
        </Space>
        <Space wrap>
          <SoundOutlined />
          <Switch checked={soundEnabled} onChange={setSoundEnabled} checkedChildren="提示音开" unCheckedChildren="提示音关" />
          <Select
            size="small"
            value={remindIntervalMs}
            onChange={setRemindInterval}
            style={{ width: 150 }}
            options={[
              { value: 0, label: '未接单不重复提醒' },
              { value: 30_000, label: '未接单每 30 秒提醒' },
              { value: 60_000, label: '未接单每 1 分钟提醒' },
              { value: 180_000, label: '未接单每 3 分钟提醒' },
            ]}
          />
          <Button size="small" onClick={playNewOrderSound}>试听</Button>
        </Space>
      </Space>

      {offline && (
        <Alert
          type="error"
          showIcon
          message="无法连接服务器"
          description={lastSync ? `当前显示的是 ${dayjs(lastSync).format('HH:mm:ss')} 的队列，可能已不是最新。恢复连接后会自动刷新。` : '尚未获取到队列，请检查网络或服务器。'}
          action={<Button size="small" onClick={() => void load()}>立即重试</Button>}
        />
      )}

      {lastSync === null && !offline ? (
        <Card loading />
      ) : visible.length === 0 ? (
        <Card><Empty description={offline ? '连接中断，无法获取队列' : view === 'ALL' ? '当前没有待处理的订单' : '该视图下没有订单'} /></Card>
      ) : view === 'ALL' ? (
        <>
          {section('待接单', pending, token.colorWarning)}
          {section('制作中', making, token.colorPrimary)}
          {section('待送餐', ready, token.colorSuccess)}
        </>
      ) : (
        <Row gutter={[16, 16]}>{visible.map(card)}</Row>
      )}
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
    </Space>
  )
}
