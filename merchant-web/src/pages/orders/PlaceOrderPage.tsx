import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App, Button, Card, Checkbox, Col, Divider, Empty, Input, InputNumber, Modal, Radio, Row, Segmented, Select, Space, Spin, Tag, Typography,
  theme as antdTheme,
} from 'antd'
import { DeleteOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { getOrderingMenu } from '../../api/menu'
import { placeOrder } from '../../api/order'
import { listTables } from '../../api/table'
import type { MenuDish, OfflinePayMethod, OrderingMenu, PayMode, TableItem } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { PAY_METHOD } from '../../utils/orderStatus'
import { ignoreShownError } from '../../utils/errors'
import Panel from '../../components/Panel'

/** 购物车一行：同一道菜不同规格 / 加料是不同的行 */
interface CartLine {
  key: string
  dish: MenuDish
  specItemIds: number[]
  addonItemIds: number[]
  /** 规格、加料的显示文字 */
  options: string
  unitPrice: number
  quantity: number
}

const PAY_METHODS: OfflinePayMethod[] = ['CASH', 'WECHAT', 'ALIPAY', 'CARD', 'OTHER']

function newRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** 单价 = 基础价 + 所选规格加价 + 所选加料加价（与服务端计价一致，最终以服务端为准） */
function priceOf(dish: MenuDish, specIds: number[], addonIds: number[]): number {
  const spec = dish.specGroups.flatMap((g) => g.items).filter((i) => specIds.includes(i.id)).reduce((s, i) => s + i.priceDelta, 0)
  const addon = dish.addonGroups.flatMap((g) => g.items).filter((i) => addonIds.includes(i.id)).reduce((s, i) => s + i.priceDelta, 0)
  return dish.price + spec + addon
}

function optionText(dish: MenuDish, specIds: number[], addonIds: number[]): string {
  const names = [
    ...dish.specGroups.flatMap((g) => g.items).filter((i) => specIds.includes(i.id)).map((i) => i.name),
    ...dish.addonGroups.flatMap((g) => g.items).filter((i) => addonIds.includes(i.id)).map((i) => `+${i.name}`),
  ]
  return names.join(' · ')
}

/**
 * 前厅代客下单：顾客不扫码（老人、没带手机、电话点单），前厅选桌、选菜、当面收款并登记收款方式。
 * 前厅下的单视为已确认，直接进入后厨「待制作」；钱是线下收的，退款同样线下退还。
 */
export default function PlaceOrderPage() {
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const { token } = antdTheme.useToken()
  const [menu, setMenu] = useState<OrderingMenu | null>(null)
  const [tables, setTables] = useState<TableItem[]>([])
  const [loadError, setLoadError] = useState(false)
  const [categoryId, setCategoryId] = useState<number | 'ALL'>('ALL')
  const [keyword, setKeyword] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [tableId, setTableId] = useState<number | undefined>()
  const [peopleCount, setPeopleCount] = useState(1)
  const [remark, setRemark] = useState('')
  // 先付后吃：下单即登记收款；先吃后付：下单不收款，顾客离店时在订单上「结账」
  const [payMode, setPayMode] = useState<PayMode>('PAY_FIRST')
  const [payMethod, setPayMethod] = useState<OfflinePayMethod>('CASH')
  const [received, setReceived] = useState<number | null>(null)
  const [payRemark, setPayRemark] = useState('')
  const [picking, setPicking] = useState<{ dish: MenuDish; specIds: number[]; addonIds: number[]; quantity: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 同一份购物车重复提交（网络重试、连点）沿用同一个请求号，服务端只建一笔；购物车变了就换新号
  const requestId = useRef<{ cartKey: string; id: string } | null>(null)

  const load = () => {
    setLoadError(false)
    Promise.all([getOrderingMenu(), listTables()])
      .then(([m, t]) => {
        setMenu(m)
        setTables(t.filter((x) => x.status === 1))
      })
      .catch((e) => {
        ignoreShownError(e)
        setLoadError(true)
      })
  }
  useEffect(load, [])

  const dishes = useMemo(() => {
    if (!menu) return []
    const all = menu.categories.flatMap((c) => c.dishes.map((d) => ({ ...d, categoryId: c.id })))
    const k = keyword.trim()
    return all.filter((d) => (categoryId === 'ALL' || d.categoryId === categoryId) && (!k || d.name.includes(k)))
  }, [menu, categoryId, keyword])

  const total = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const count = cart.reduce((s, l) => s + l.quantity, 0)
  /** 这道菜已加入购物车的总份数（各规格合计），用于不超过今日剩余 */
  const qtyOfDish = (dishId: number) => cart.filter((l) => l.dish.id === dishId).reduce((s, l) => s + l.quantity, 0)
  const canAddMore = (dish: MenuDish, extra = 1) => dish.remainingStock == null || qtyOfDish(dish.id) + extra <= dish.remainingStock

  const addLine = (dish: MenuDish, specIds: number[], addonIds: number[], quantity: number) => {
    if (!canAddMore(dish, quantity)) {
      message.warning(`「${dish.name}」今日只剩 ${dish.remainingStock} 份`)
      return
    }
    const key = `${dish.id}|${[...specIds].sort().join(',')}|${[...addonIds].sort().join(',')}`
    setCart((prev) => {
      const hit = prev.find((l) => l.key === key)
      if (hit) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l))
      return [...prev, { key, dish, specItemIds: specIds, addonItemIds: addonIds, options: optionText(dish, specIds, addonIds), unitPrice: priceOf(dish, specIds, addonIds), quantity }]
    })
  }

  const clickDish = (dish: MenuDish) => {
    if (dish.soldOut) return
    if (dish.specGroups.length === 0 && dish.addonGroups.length === 0) {
      addLine(dish, [], [], 1)
      return
    }
    // 有规格 / 加料：先选；默认规格预先选中
    const defaults = dish.specGroups.map((g) => (g.items.find((i) => i.isDefault) ?? (g.required ? g.items[0] : undefined))?.id).filter((x): x is number => x != null)
    setPicking({ dish, specIds: defaults, addonIds: [], quantity: 1 })
  }

  const confirmPick = () => {
    if (!picking) return
    const missing = picking.dish.specGroups.find((g) => g.required && !g.items.some((i) => picking.specIds.includes(i.id)))
    if (missing) {
      message.warning(`请选择${missing.name}`)
      return
    }
    addLine(picking.dish, picking.specIds, picking.addonIds, picking.quantity)
    setPicking(null)
  }

  const changeQty = (line: CartLine, delta: number) => {
    if (delta > 0 && !canAddMore(line.dish)) {
      message.warning(`「${line.dish.name}」今日只剩 ${line.dish.remainingStock} 份`)
      return
    }
    setCart((prev) => prev.flatMap((l) => (l.key !== line.key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }])))
  }

  const payLater = payMode === 'PAY_LATER'
  const change = !payLater && payMethod === 'CASH' && received != null ? Math.round(received * 100) - total : null

  const submit = async () => {
    if (!tableId) {
      message.warning('请选择桌号')
      return
    }
    if (cart.length === 0) {
      message.warning('请先选择菜品')
      return
    }
    if (change != null && change < 0) {
      message.warning(`实收不足，还差 ${formatYuan(-change)}`)
      return
    }
    const table = tables.find((t) => t.id === tableId)
    // 二次确认：下单后立即进入后厨制作，并记一笔线下收款
    const ok = await modal.confirm({
      title: payLater ? `确认下单 ${formatYuan(total)}（先吃后付）？` : `确认下单并收款 ${formatYuan(total)}？`,
      content: payLater
        ? `${table?.code ?? ''} 桌 · ${peopleCount} 人 · 共 ${count} 件。现在不收款，顾客离店时在订单里「结账」。下单后后厨立即收到。`
        : `${table?.code ?? ''} 桌 · ${peopleCount} 人 · 共 ${count} 件 · ${PAY_METHOD[payMethod]}收款${change != null ? `，找零 ${formatYuan(change)}` : ''}。下单后后厨立即收到。`,
      okText: '确认下单',
    })
    if (!ok) return
    const items = cart.map((l) => ({ dishId: l.dish.id, specItemIds: l.specItemIds, addonItemIds: l.addonItemIds, quantity: l.quantity }))
    const cartKey = JSON.stringify({ tableId, items, peopleCount, remark, payMode, payMethod })
    if (!requestId.current || requestId.current.cartKey !== cartKey) requestId.current = { cartKey, id: newRequestId() }
    setSubmitting(true)
    try {
      const order = await placeOrder({
        clientRequestId: requestId.current.id,
        tableId,
        items,
        peopleCount,
        remark: remark.trim() || undefined,
        payMode,
        payMethod: payLater ? undefined : payMethod,
        payRemark: payLater ? undefined : payRemark.trim() || undefined,
      })
      if (order.payAmount !== total) {
        // 服务端按最新菜单计价：价格变了要提醒前厅按实际金额收款
        modal.warning({ title: '菜品价格已更新', content: `实际金额为 ${formatYuan(order.payAmount)}（页面显示 ${formatYuan(total)}），${payLater ? '结账时按实际金额收款' : '请按实际金额核对收款'}。` })
      }
      message.success(payLater ? `已下单：${order.tableCode ?? ''} 桌（先吃后付），离店时记得结账` : `已下单：${order.tableCode ?? ''} 桌，后厨已收到`)
      requestId.current = null
      navigate(`/orders?status=MAKING&orderNo=${order.orderNo}`)
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示（售罄、打烊、库存不足等）；购物车保留，改完可直接重试
      getOrderingMenu().then(setMenu).catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return <Panel padding="48px 0"><Empty description="菜单加载失败"><Button type="primary" onClick={load}>重试</Button></Empty></Panel>
  }
  if (!menu) {
    return <div style={{ textAlign: 'center', padding: 64 }}><Spin /></div>
  }

  return (
    <Row gutter={[16, 16]} align="top">
      <Col xs={24} xl={15}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Segmented<number | 'ALL'>
              value={categoryId}
              onChange={(v) => setCategoryId(v as number | 'ALL')}
              options={[{ label: '全部', value: 'ALL' }, ...menu.categories.map((c) => ({ label: c.name, value: c.id }))]}
            />
            <Input.Search allowClear placeholder="搜索菜品" style={{ width: 200 }} onChange={(e) => setKeyword(e.target.value)} />
          </Space>
          {dishes.length === 0 ? (
            <Panel padding="48px 0"><Empty description="没有可点的菜品" /></Panel>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {dishes.map((d) => {
                const inCart = qtyOfDish(d.id)
                const unavailable = d.soldOut || (d.remainingStock != null && d.remainingStock <= 0)
                return (
                  <Card
                    key={d.id}
                    size="small"
                    hoverable={!unavailable}
                    onClick={() => !unavailable && clickDish(d)}
                    style={{ opacity: unavailable ? 0.5 : 1, boxShadow: inCart ? `0 0 0 2px ${token.colorPrimary}` : undefined }}
                    styles={{ body: { padding: 14 } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Typography.Text strong ellipsis style={{ fontSize: 15 }}>{d.name}</Typography.Text>
                      {inCart > 0 && <Tag color="orange" style={{ marginInlineEnd: 0 }}>×{inCart}</Tag>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                      <Typography.Text style={{ color: token.colorPrimary, fontWeight: 600 }}>{formatYuan(d.price)}</Typography.Text>
                      {unavailable
                        ? <Tag style={{ marginInlineEnd: 0 }}>已售罄</Tag>
                        : d.remainingStock != null
                          ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>剩 {d.remainingStock}</Typography.Text>
                          : (d.specGroups.length > 0 || d.addonGroups.length > 0) && <Typography.Text type="secondary" style={{ fontSize: 12 }}>选规格</Typography.Text>}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </Space>
      </Col>

      <Col xs={24} xl={9}>
        <Card title="下单与收款" style={{ position: 'sticky', top: 80 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%' }}>
              <Select
                showSearch
                placeholder="选择桌号"
                style={{ width: 160 }}
                value={tableId}
                onChange={setTableId}
                optionFilterProp="label"
                options={tables.map((t) => ({ value: t.id, label: t.code }))}
              />
              <InputNumber min={1} max={99} precision={0} value={peopleCount} onChange={(v) => setPeopleCount(v ?? 1)} addonAfter="人" style={{ width: 120 }} />
            </Space>

            {cart.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点左侧菜品加入" />
            ) : (
              <div>
                {cart.map((l) => (
                  <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${token.colorSplit}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong ellipsis style={{ display: 'block' }}>{l.dish.name}</Typography.Text>
                      {l.options && <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>{l.options}</Typography.Text>}
                    </div>
                    <Typography.Text style={{ width: 64, textAlign: 'right' }}>{formatYuan(l.unitPrice * l.quantity)}</Typography.Text>
                    <Space size={4}>
                      <Button size="small" icon={l.quantity === 1 ? <DeleteOutlined /> : <MinusOutlined />} onClick={() => changeQty(l, -1)} aria-label="减少" />
                      <span style={{ width: 20, textAlign: 'center', display: 'inline-block' }}>{l.quantity}</span>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => changeQty(l, 1)} aria-label="增加" />
                    </Space>
                  </div>
                ))}
              </div>
            )}
            <Input.TextArea rows={2} maxLength={255} placeholder="备注（口味、忌口等，后厨可见）" value={remark} onChange={(e) => setRemark(e.target.value)} />

            <Divider style={{ margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography.Text>共 {count} 件</Typography.Text>
              <Typography.Text strong style={{ fontSize: 24, color: token.colorPrimary }}>{formatYuan(total)}</Typography.Text>
            </div>

            <Segmented<PayMode>
              block
              value={payMode}
              onChange={setPayMode}
              options={[{ label: '先付后吃', value: 'PAY_FIRST' }, { label: '先吃后付', value: 'PAY_LATER' }]}
            />
            {payLater ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                现在不收款，后厨直接制作；顾客离店时在订单管理「未结账」里找到这单结账。
              </Typography.Text>
            ) : (<>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>收款方式（线下收款登记）</Typography.Text>
              <Radio.Group
                style={{ display: 'block', marginTop: 6 }}
                optionType="button"
                buttonStyle="solid"
                value={payMethod}
                onChange={(e) => { setPayMethod(e.target.value); setReceived(null) }}
                options={PAY_METHODS.map((m) => ({ value: m, label: PAY_METHOD[m] }))}
              />
            </div>
            {payMethod === 'CASH' && (
              <Space wrap>
                <InputNumber min={0} max={100000} precision={2} prefix="¥" placeholder="实收金额" value={received} onChange={(v) => setReceived(v)} style={{ width: 160 }} />
                {change != null && (
                  change >= 0
                    ? <Typography.Text>找零 <Typography.Text strong>{formatYuan(change)}</Typography.Text></Typography.Text>
                    : <Typography.Text type="danger">还差 {formatYuan(-change)}</Typography.Text>
                )}
              </Space>
            )}
            <Input maxLength={255} placeholder="收款备注（可选），如：转账尾号 1234" value={payRemark} onChange={(e) => setPayRemark(e.target.value)} />
            </>)}
            <Button type="primary" size="large" block loading={submitting} disabled={cart.length === 0} onClick={submit} style={{ height: 52, fontSize: 16 }}>
              {payLater ? `确认下单 ${formatYuan(total)}（先吃后付）` : `确认下单并收款 ${formatYuan(total)}`}
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>前厅下的单视为已确认，直接进入后厨「待制作」；已收的款退款时需线下退还。</Typography.Text>
          </Space>
        </Card>
      </Col>

      <Modal
        title={picking?.dish.name}
        open={picking !== null}
        onCancel={() => setPicking(null)}
        onOk={confirmPick}
        okText={picking ? `加入 · ${formatYuan(priceOf(picking.dish, picking.specIds, picking.addonIds) * picking.quantity)}` : '加入'}
        destroyOnHidden
      >
        {picking && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {picking.dish.specGroups.map((g) => (
              <div key={g.id}>
                <Typography.Text strong>{g.name}{g.required ? '（必选）' : ''}</Typography.Text>
                <Radio.Group
                  style={{ display: 'block', marginTop: 6 }}
                  optionType="button"
                  value={g.items.find((i) => picking.specIds.includes(i.id))?.id}
                  onChange={(e) => setPicking({ ...picking, specIds: [...picking.specIds.filter((id) => !g.items.some((i) => i.id === id)), e.target.value] })}
                  options={g.items.map((i) => ({ value: i.id, label: i.priceDelta ? `${i.name} +${formatYuan(i.priceDelta)}` : i.name }))}
                />
              </div>
            ))}
            {picking.dish.addonGroups.map((g) => (
              <div key={g.id}>
                <Typography.Text strong>{g.name}{g.maxCount > 0 ? `（最多 ${g.maxCount} 项）` : ''}</Typography.Text>
                <Checkbox.Group
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}
                  value={picking.addonIds.filter((id) => g.items.some((i) => i.id === id))}
                  onChange={(vals) => {
                    const chosen = vals as number[]
                    if (g.maxCount > 0 && chosen.length > g.maxCount) {
                      message.warning(`${g.name}最多选 ${g.maxCount} 项`)
                      return
                    }
                    setPicking({ ...picking, addonIds: [...picking.addonIds.filter((id) => !g.items.some((i) => i.id === id)), ...chosen] })
                  }}
                  options={g.items.map((i) => ({ value: i.id, label: `${i.name} +${formatYuan(i.priceDelta)}` }))}
                />
              </div>
            ))}
            <Space>
              <Typography.Text strong>数量</Typography.Text>
              <InputNumber min={1} max={99} precision={0} value={picking.quantity} onChange={(v) => setPicking({ ...picking, quantity: v ?? 1 })} />
            </Space>
          </Space>
        )}
      </Modal>
    </Row>
  )
}
