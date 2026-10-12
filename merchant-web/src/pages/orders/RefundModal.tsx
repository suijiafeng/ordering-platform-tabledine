import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App, Form, Input, InputNumber, Modal, Radio, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { refundOrder } from '../../api/order'
import type { OrderDetail, OrderItemView, RefundType } from '../../api/types'
import { fenToYuan, formatYuan, yuanToFen } from '../../utils/money'
import { ignoreShownError } from '../../utils/errors'
import { ApiError } from '../../utils/request'
import { clearPendingRefund, loadPendingRefund, savePendingRefund, type PendingRefund } from './pendingRefund'

interface Props {
  order: OrderDetail | null
  open: boolean
  onClose: () => void
  onDone: () => void
}

/** 商家主动退款：整单 / 按菜品（选数量）/ 自定义金额（仅店主） */
export default function RefundModal({ order, open, onClose, onDone }: Props) {
  const { message, modal } = App.useApp()
  const [type, setType] = useState<RefundType>('FULL')
  const [reason, setReason] = useState('')
  const [amountYuan, setAmountYuan] = useState<number | null>(null)
  const [qty, setQty] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<PendingRefund | null>(null)
  const [recoveryError, setRecoveryError] = useState(false)
  const generation = useRef(0)
  const busy = useRef(false)
  const orderNo = order?.orderNo

  useEffect(() => {
    generation.current += 1
    busy.current = false
    setSaving(false)
    setPending(null)
    setRecoveryError(false)
    if (open && orderNo) {
      try {
        const saved = loadPendingRefund(orderNo)
        setPending(saved)
        setType(saved?.request.type ?? 'FULL')
        setReason(saved?.request.reason ?? '')
        setAmountYuan(saved?.request.amount === undefined ? null : fenToYuan(saved.request.amount))
        setQty(Object.fromEntries((saved?.request.items ?? []).map((item) => [item.orderItemId, item.quantity])))
      } catch {
        // 无法读取原请求时禁止重新发起，避免把未知结果当作未退款。
        setRecoveryError(true)
      }
    }
    return () => { generation.current += 1 }
  }, [open, orderNo])

  const items = useMemo(() => (order?.items ?? []).filter((i) => i.quantity - i.refundedQty > 0), [order])
  const itemAmount = useMemo(
    () => items.reduce((sum, i) => sum + (qty[i.id] ?? 0) * i.unitPrice, 0),
    [items, qty],
  )
  const refundable = order?.refundableAmount ?? 0
  // 线下收款（前厅代客下单）：钱不在系统里，退款由员工当面退还
  const offline = order?.payment?.channel === 'OFFLINE'
  const finalAmount = pending?.amountInCents ?? (type === 'FULL' ? refundable : type === 'ITEM' ? itemAmount : yuanToFen(amountYuan))

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
          disabled={saving || pending !== null || recoveryError}
          min={0}
          max={r.quantity - r.refundedQty}
          precision={0}
          value={qty[r.id] ?? 0}
          onChange={(v) => setQty((q) => ({ ...q, [r.id]: v ?? 0 }))}
          style={{ width: 90 }}
        />
      ),
    },
  ]

  const submit = async () => {
    if (!order || busy.current || recoveryError) return
    if (!pending && !reason.trim()) {
      message.warning('请填写退款原因')
      return
    }
    if (!pending && finalAmount <= 0) {
      message.warning(type === 'ITEM' ? '请选择退款菜品数量' : '退款金额必须大于 0')
      return
    }
    if (!pending && finalAmount > refundable) {
      message.warning(`退款金额不能超过可退余额 ${formatYuan(refundable)}`)
      return
    }
    const session = generation.current
    const isCurrent = () => generation.current === session
    // 在确认框之前同步占位，阻止 React 下一次渲染前的双击创建两个确认流程。
    busy.current = true
    setSaving(true)
    const attempt: PendingRefund = pending ?? {
      orderNo: order.orderNo,
      amountInCents: finalAmount,
      request: {
        clientRequestId: newRequestId(),
        type,
        reason: reason.trim(),
        items: type === 'ITEM' ? Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ orderItemId: Number(id), quantity: q })) : undefined,
        amount: type === 'CUSTOM' ? finalAmount : undefined,
      },
    }
    try {
      // 内容在弹出确认框前固定；确认期间刷新订单或切换抽屉都不能改变这次退款。
      const ok = await modal.confirm({
        title: pending ? `确认上次退款结果（${formatYuan(attempt.amountInCents)}）？` : `确认退款 ${formatYuan(attempt.amountInCents)}？`,
        content: pending
          ? `订单 ${attempt.orderNo}。会使用原请求编号确认同一笔退款，请勿重复当面退还现金。`
          : `订单 ${attempt.orderNo}（${order.tableCode ?? '-'} 桌）。${offline ? '该单为线下收款，系统只记为线下退款，请当面退还顾客' : '退款会立即退回顾客会员余额'}，提交后无法撤回。`,
        okText: pending ? '确认原退款' : '确认退款',
        okButtonProps: { danger: true },
      })
      if (!ok || !isCurrent()) return
      try {
        savePendingRefund(attempt)
      } catch {
        message.error('无法保存退款请求，请允许浏览器存储后重试；本次尚未提交')
        return
      }
      setPending(attempt)
      try {
        await refundOrder(attempt.orderNo, attempt.request)
      } catch (e) {
        // 首次请求明确被业务校验拒绝时可以编辑；已有未知结果的恢复请求始终保留原身份。
        if (!pending && e instanceof ApiError && e.code > 0 && e.status !== undefined && e.status >= 400 && e.status < 500) {
          clearPendingRefund(attempt)
          if (isCurrent()) setPending(null)
        }
        ignoreShownError(e)
        return
      }
      clearPendingRefund(attempt)
      if (isCurrent()) {
        setPending(null)
        message.success('退款已确认')
        onDone()
      }
    } finally {
      if (isCurrent()) {
        busy.current = false
        setSaving(false)
      }
    }
  }

  return (
    <Modal title={`退款 · 订单 ${order?.orderNo ?? ''}`} open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} okText={pending ? "重试确认原退款" : "确认退款"} okButtonProps={{ danger: true, disabled: recoveryError }} width={640} destroyOnHidden>
      {recoveryError && <Alert type="error" showIcon message="无法恢复上次退款请求，请先在退款管理中核对原退款，勿重复发起" style={{ marginBottom: 16 }} />}
      {pending && <Alert type="warning" showIcon message="上次退款结果尚未确认，重试将确认同一笔退款" description="已保留原请求编号和金额，请勿另开一笔退款或重复退还现金。" style={{ marginBottom: 16 }} />}
      <Form layout="vertical" disabled={saving || pending !== null || recoveryError}>
        <Form.Item label="退款方式">
          <Radio.Group value={type} onChange={(e) => setType(e.target.value as RefundType)}>
            <Radio.Button value="FULL">整单全额</Radio.Button>
            <Radio.Button value="ITEM">按菜品</Radio.Button>
            <Radio.Button value="CUSTOM">自定义金额</Radio.Button>
          </Radio.Group>
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
              <span>本次退款 <Typography.Text type="danger" strong>{formatYuan(finalAmount)}</Typography.Text></span>
            </Space>
          }
          description={offline ? '线下收款订单：系统不退余额，记为线下退款，请当面退还顾客；退款不改变订单履约状态。' : '退款退回顾客的会员余额；退款不改变订单履约状态。'}
        />
      </Form>
    </Modal>
  )
}

/** 随机编号只在一次新退款意图开始时生成，绝不在 HTTP 重试时更换。 */
function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}
