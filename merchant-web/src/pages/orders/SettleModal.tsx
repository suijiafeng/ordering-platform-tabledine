import { useEffect, useState } from 'react'
import { App, Input, InputNumber, Modal, Radio, Space, Typography } from 'antd'
import { settleOrder } from '../../api/order'
import type { OfflinePayMethod, OrderDetail } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { PAY_METHOD } from '../../utils/orderStatus'
import { ignoreShownError } from '../../utils/errors'

const PAY_METHODS: OfflinePayMethod[] = ['CASH', 'WECHAT', 'ALIPAY', 'CARD', 'OTHER']

interface Props {
  order: OrderDetail | null
  open: boolean
  onClose: () => void
  onDone: () => void
}

/**
 * 先吃后付订单结账：选择收款方式（现金可算找零），二次确认后登记线下收款，订单此刻入账。
 */
export default function SettleModal({ order, open, onClose, onDone }: Props) {
  const { message, modal } = App.useApp()
  const [payMethod, setPayMethod] = useState<OfflinePayMethod>('CASH')
  const [received, setReceived] = useState<number | null>(null)
  const [payRemark, setPayRemark] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setPayMethod('CASH')
      setReceived(null)
      setPayRemark('')
    }
  }, [open])

  if (!order) return null
  const amount = order.payAmount
  const change = payMethod === 'CASH' && received != null ? Math.round(received * 100) - amount : null

  const submit = async () => {
    if (change != null && change < 0) {
      message.warning(`实收不足，还差 ${formatYuan(-change)}`)
      return
    }
    // 二次确认：收款登记后计入当天实收
    const ok = await modal.confirm({
      title: `确认收款 ${formatYuan(amount)}？`,
      content: `${order.tableCode ?? ''} 桌 · ${PAY_METHOD[payMethod]}收款${change != null ? `，找零 ${formatYuan(change)}` : ''}。确认后订单结账完成。`,
      okText: '确认收款',
    })
    if (!ok) return
    setSaving(true)
    try {
      await settleOrder(order.orderNo, { payMethod, payRemark: payRemark.trim() || undefined })
      message.success(`${order.tableCode ?? ''} 桌已结账 ${formatYuan(amount)}`)
      onDone()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示（如已结账、已取消）
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`结账 · ${order.tableCode ?? ''} 桌`} open={open} onCancel={onClose} onOk={submit} okText="收款结账" confirmLoading={saving} destroyOnHidden>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text type="secondary">应收金额</Typography.Text>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formatYuan(amount)}</div>
        </div>
        <div>
          <Typography.Text type="secondary">收款方式</Typography.Text>
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
            <InputNumber min={0} max={100000} precision={2} prefix="¥" placeholder="实收金额" value={received} onChange={setReceived} style={{ width: 160 }} autoFocus />
            {change != null && (change >= 0
              ? <Typography.Text>找零 <Typography.Text strong>{formatYuan(change)}</Typography.Text></Typography.Text>
              : <Typography.Text type="danger">还差 {formatYuan(-change)}</Typography.Text>)}
          </Space>
        )}
        <Input maxLength={255} placeholder="收款备注（可选），如：转账尾号 1234" value={payRemark} onChange={(e) => setPayRemark(e.target.value)} />
      </Space>
    </Modal>
  )
}
