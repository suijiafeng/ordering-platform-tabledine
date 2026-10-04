'use client'

import { Button, Popup, Stepper, TextArea } from 'antd-mobile'
import { useEffect, useMemo, useState } from 'react'
import type { OrderItem } from '@/lib/types'
import { itemOptionsText, yuan } from '@/lib/format'
import { notify } from '@/store/feedback'
import { confirmDialog, getAppShell } from '@/lib/ui'

interface Props {
  visible: boolean
  items: OrderItem[]
  refundableAmount: number
  busy: boolean
  onClose: () => void
  onSubmit: (reason: string, items: { orderItemId: number; quantity: number }[]) => void
}

export function RefundSheet({ visible, items, refundableAmount, busy, onClose, onSubmit }: Props) {
  const refundable = useMemo(() => items.map((item) => ({ item, max: item.quantity - item.refundedQty })).filter(({ max }) => max > 0), [items])
  const [step, setStep] = useState<'notice' | 'form'>('notice')
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')

  useEffect(() => { if (visible) { setStep('notice'); setQuantities({}); setReason('') } }, [visible])

  const selected = refundable.filter(({ item }) => (quantities[item.id] ?? 0) > 0)
  const allSelected = refundable.length > 0 && refundable.every(({ item, max }) => quantities[item.id] === max)
  const selectedAmount = selected.reduce((sum, { item }) => sum + item.unitPrice * (quantities[item.id] ?? 0), 0)
  const amount = allSelected ? Math.min(selectedAmount, refundableAmount) : selectedAmount
  const overLimit = !allSelected && selectedAmount > refundableAmount

  const submit = async () => {
    if (busy) return
    if (!selected.length) return notify('请选择要退的菜品')
    if (!reason.trim()) return notify('请填写退款原因')
    if (overLimit) return notify(`所选金额超过可退余额 ¥${yuan(refundableAmount)}`)
    const scope = allSelected ? '整单' : '所选菜品'
    if (!(await confirmDialog('确认退款', `将申请${scope}退款 ¥${yuan(amount)}，提交后需等待商家审核。`, '提交退款'))) return
    onSubmit(reason.trim(), allSelected ? [] : selected.map(({ item }) => ({ orderItemId: item.id, quantity: quantities[item.id] })))
  }

  return <Popup visible={visible} getContainer={getAppShell} onMaskClick={busy ? undefined : onClose} bodyStyle={{ borderRadius: '18px 18px 0 0' }}>
    <div className="sheet refund-sheet">
      {step === 'notice' ? <>
        <div className="refund-head"><h2>申请售后</h2></div>
        <div className="refund-notice">
          <strong>提交退款前，请先确认</strong>
          <ul>
            <li>菜品少送、错送或口味问题，建议先联系店员处理。</li>
            <li>只选择确实需要退款的菜品和数量。</li>
            <li>退款申请将由商家审核，提交后不会立即到账。</li>
          </ul>
        </div>
        <div className="refund-guide-actions">
          <Button fill="none" disabled={busy} onClick={onClose}>暂不退款</Button>
          <Button fill="outline" disabled={busy} onClick={() => setStep('form')}>继续申请</Button>
        </div>
      </> : <>
        <div className="refund-head">
          <div><button className="refund-back" disabled={busy} onClick={() => setStep('notice')}>‹ 返回</button><h2>填写退款信息</h2></div>
          <button className="soft-link" disabled={busy} onClick={() => setQuantities(allSelected ? {} : Object.fromEntries(refundable.map(({ item, max }) => [item.id, max])))}>{allSelected ? '取消全选' : '选择整单'}</button>
        </div>
        <div className="sheet-scroll">
          {refundable.map(({ item, max }) => <div className="refund-item" key={item.id}>
            <div className="row-main"><strong>{item.dishName}</strong><div className="muted">{itemOptionsText(item)} ¥{yuan(item.unitPrice)} · 可退 {max}</div></div>
            <Stepper min={0} max={max} value={quantities[item.id] ?? 0} onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} />
          </div>)}
          <TextArea value={reason} onChange={setReason} maxLength={255} showCount rows={3} placeholder="请详细填写退款原因" className="refund-reason" />
        </div>
        <div className="refund-foot"><div><span className="muted">预计退款</span><div className="amount-large">¥{yuan(amount)}</div>{overLimit && <div className="warning">可退 ¥{yuan(refundableAmount)}</div>}</div><Button fill="outline" loading={busy} disabled={!selected.length || overLimit} onClick={submit}>核对并提交</Button></div>
      </>}
    </div>
  </Popup>
}
