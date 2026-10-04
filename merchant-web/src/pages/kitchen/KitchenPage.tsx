import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Col, Empty, Row, Space, Switch, Tag, Typography } from 'antd'
import { CheckOutlined, FireOutlined, SoundOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { acceptOrder, kitchenQueue, readyOrder } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import { playNewOrderSound, usePollStore } from '../../hooks/useOrderPoll'
import OrderDetailDrawer from '../orders/OrderDetailDrawer'

const REFRESH_MS = 5000

function elapsed(from: string | null): string {
  if (!from) {
    return ''
  }
  const m = dayjs().diff(dayjs(from), 'minute')
  return m < 1 ? '刚刚' : `${m} 分钟`
}

/** 后厨队列：只显示待制作 / 制作中，大字体卡片，一键接单 / 出餐；5 秒自动刷新 */
export default function KitchenPage() {
  const { message } = App.useApp()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const { soundEnabled, setSoundEnabled } = usePollStore()

  const load = useCallback(async () => {
    try {
      setOrders(await kitchenQueue())
    } catch {
      // 轮询失败静默，下一轮重试
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load()
        setTick((t) => t + 1)
      }
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const act = async (o: OrderSummary) => {
    setActing(o.orderNo)
    try {
      if (o.status === 'PAID') {
        await acceptOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 已接单`)
      } else {
        await readyOrder(o.orderNo)
        message.success(`桌 ${o.tableCode ?? ''} 已出餐`)
      }
    } catch {
      // 已统一提示
    } finally {
      setActing(null)
      void load()
    }
  }

  const pending = orders.filter((o) => o.status === 'PAID')
  const making = orders.filter((o) => o.status === 'MAKING')

  const card = (o: OrderSummary) => {
    const isPending = o.status === 'PAID'
    return (
      <Col key={o.id} xs={24} sm={12} xl={8} xxl={6}>
        <Card
          size="small"
          style={{ borderTop: `4px solid ${isPending ? '#fa8c16' : '#1677ff'}`, height: '100%' }}
          styles={{ body: { padding: 16 } }}
          onClick={() => setDetail(o.orderNo)}
          hoverable
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Typography.Title level={2} style={{ margin: 0 }}>{o.tableCode ?? '-'}</Typography.Title>
            <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
              <Tag color={isPending ? 'orange' : 'processing'} style={{ marginRight: 0 }}>{isPending ? '待接单' : '制作中'}</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {isPending ? `支付 ${elapsed(o.paidAt)}` : `制作 ${elapsed(o.acceptedAt)}`}
              </Typography.Text>
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
            icon={isPending ? <FireOutlined /> : <CheckOutlined />}
            loading={acting === o.orderNo}
            onClick={(e) => { e.stopPropagation(); void act(o) }}
          >
            {isPending ? '接单' : '出餐'}
          </Button>
        </Card>
      </Col>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space size="large">
          <Typography.Title level={4} style={{ margin: 0 }}>后厨队列</Typography.Title>
          <Typography.Text type="secondary">待接单 {pending.length} · 制作中 {making.length} · 每 5 秒刷新</Typography.Text>
        </Space>
        <Space>
          <SoundOutlined />
          <Switch checked={soundEnabled} onChange={setSoundEnabled} checkedChildren="提示音开" unCheckedChildren="提示音关" />
          <Button size="small" onClick={playNewOrderSound}>试听</Button>
        </Space>
      </Space>
      {orders.length === 0 ? (
        <Card><Empty description="当前没有待制作的订单" /></Card>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <Typography.Text strong style={{ color: '#fa8c16' }}>待接单</Typography.Text>
              <Row gutter={[16, 16]}>{pending.map(card)}</Row>
            </>
          )}
          {making.length > 0 && (
            <>
              <Typography.Text strong style={{ color: '#1677ff' }}>制作中</Typography.Text>
              <Row gutter={[16, 16]}>{making.map(card)}</Row>
            </>
          )}
        </>
      )}
      <OrderDetailDrawer orderNo={detail} open={!!detail} onClose={() => setDetail(null)} onChanged={() => void load()} />
    </Space>
  )
}
