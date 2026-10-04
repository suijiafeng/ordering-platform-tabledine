import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Form, Input, InputNumber, Modal, Radio, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { refundOrder } from '../../api/order'
import type { OrderDetail, OrderItemView, RefundType } from '../../api/types'
import { fenToYuan, formatYuan, yuanToFen } from '../../utils/money'
import { useIsOwner } from '../../utils/auth'

interface Props {
  order: OrderDetail | null
  open: boolean
  onClose: () => void
  onDone: () => void
}

/** 商家主动退款：整单 / 按菜品（选数量）/ 自定义金额（仅店主） */
export default function RefundModal({ order, open, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const isOwner = useIsOwner()
  const [type, setType] = useState<RefundType>('FULL')
  const [reason, setReason] = useState('')
  const [amountYuan, setAmountYuan] = useState<number | null>(null)
  const [qty, setQty] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setType('FULL')
      setReason('')
      setAmountYuan(null)
      setQty({})
    }
  }, [open])

  const items = useMemo(() => (order?.items ?? []).filter((i) => i.quantity - i.refundedQty > 0), [order])
  const itemAmount = useMemo(
    () => items.reduce((sum, i) => sum + (qty[i.id] ?? 0) * i.unitPrice, 0),
    [items, qty],
  )
  const refundable = order?.refundableAmount ?? 0
  const finalAmount = type === 'FULL' ? refundable : type === 'ITEM' ? itemAmount : yuanToFen(amountYuan)

  const columns: ColumnsType<OrderItemView> = [
    {
      title: '菜品',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.dishName}</span>
          {(r.specDesc || r.addonDesc) && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{[r.specDesc, r.addonDesc].filter(Boolean).join(' · ')}</Typography.Text>
          )}
        </Space>
      ),
    },
    { title: '单价', dataIndex: 'unitPrice', width: 90, render: (v: number) => formatYuan(v) },
    { title: '可退', width: 70, render: (_, r) => `${r.quantity - r.refundedQty} 份` },
    {
      title: '退款数量',
      width: 120,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={r.quantity - r.refundedQty}
          value={qty[r.id] ?? 0}
          onChange={(v) => setQty((q) => ({ ...q, [r.id]: v ?? 0 }))}
          style={{ width: 90 }}
        />
      ),
    },
  ]

  const submit = async () => {
    if (!order) {
      return
    }
    if (!reason.trim()) {
      message.warning('请填写退款原因')
      return
    }
    if (finalAmount <= 0) {
      message.warning(type === 'ITEM' ? '请选择退款菜品数量' : '退款金额必须大于 0')
      return
    }
    if (finalAmount > refundable) {
      message.warning(`退款金额不能超过可退余额 ${formatYuan(refundable)}`)
      return
    }
    setSaving(true)
    try {
      await refundOrder(order.orderNo, {
        type,
        reason: reason.trim(),
        items: type === 'ITEM' ? Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ orderItemId: Number(id), quantity: q })) : undefined,
        amount: type === 'CUSTOM' ? finalAmount : undefined,
      })
      message.success('退款已发起')
      onDone()
    } catch {
      // 错误提示已由 request 统一弹出
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`退款 · 订单 ${order?.orderNo ?? ''}`} open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} okText="确认退款" okButtonProps={{ danger: true }} width={640} destroyOnHidden>
      <Form layout="vertical">
        <Form.Item label="退款方式">
          <Radio.Group value={type} onChange={(e) => setType(e.target.value as RefundType)}>
            <Radio.Button value="FULL">整单全额</Radio.Button>
            <Radio.Button value="ITEM" disabled={!isOwner}>按菜品</Radio.Button>
            <Radio.Button value="CUSTOM" disabled={!isOwner}>自定义金额</Radio.Button>
          </Radio.Group>
          {!isOwner && <div style={{ marginTop: 6 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>部分退款与自定义金额仅店主可操作</Typography.Text></div>}
        </Form.Item>
        {type === 'ITEM' && (
          <Table<OrderItemView> rowKey="id" size="small" pagination={false} columns={columns} dataSource={items} style={{ marginBottom: 16 }} />
        )}
        {type === 'CUSTOM' && (
          <Form.Item label="退款金额（元）" extra="用于售后补偿等场景，不能超过可退余额">
            <InputNumber min={0.01} max={fenToYuan(refundable)} precision={2} value={amountYuan} onChange={setAmountYuan} style={{ width: 200 }} prefix="¥" />
          </Form.Item>
        )}
        <Form.Item label="退款原因" required>
          <Input.TextArea rows={2} maxLength={255} showCount value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：菜品缺料无法制作" />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message={
            <Space size="large">
              <span>可退余额 <b>{formatYuan(refundable)}</b></span>
              <span>本次退款 <b style={{ color: '#cf1322' }}>{formatYuan(finalAmount)}</b></span>
            </Space>
          }
          description="退款原路退回顾客支付账户；退款不改变订单履约状态。"
        />
      </Form>
    </Modal>
  )
}
