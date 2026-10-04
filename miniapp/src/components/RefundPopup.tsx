import { useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import type { OrderItemView } from '../api/types'
import { formatYuan } from '../utils/money'
import Stepper from './Stepper'
import './RefundPopup.css'
import { toast } from '../utils/toast'

interface Props {
  items: OrderItemView[]
  /** 后端的可退余额（实付 − 已退）；商家按自定义金额退过后会小于按菜品算出的金额 */
  refundableAmount: number
  onClose: () => void
  /** selection 为空数组表示整单（全部可退菜品都被选中） */
  onSubmit: (reason: string, selection: { orderItemId: number; quantity: number }[]) => void
}

/** 申请退款：按菜品选择退几份（可退 = 购买数量 - 已退数量），全部选满即整单退款 */
export default function RefundPopup({ items, refundableAmount, onClose, onSubmit }: Props) {
  const refundable = useMemo(
    () => items.map((i) => ({ item: i, max: i.quantity - i.refundedQty })).filter((x) => x.max > 0),
    [items],
  )
  const [qty, setQty] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')

  const selected = refundable.filter((x) => (qty[x.item.id] ?? 0) > 0)
  const itemsAmount = selected.reduce((s, x) => s + x.item.unitPrice * qty[x.item.id], 0)
  const allSelected = refundable.length > 0 && refundable.every((x) => qty[x.item.id] === x.max)
  // 整单按后端可退余额退；按菜品退不能超过可退余额
  const amount = allSelected ? Math.min(itemsAmount, refundableAmount) : itemsAmount
  const overLimit = !allSelected && itemsAmount > refundableAmount

  const change = (id: number, max: number, delta: number) =>
    setQty((q) => ({ ...q, [id]: Math.min(max, Math.max(0, (q[id] ?? 0) + delta)) }))

  const toggleAll = () =>
    setQty(allSelected ? {} : Object.fromEntries(refundable.map((x) => [x.item.id, x.max])))

  const submit = () => {
    if (selected.length === 0) {
      toast('请选择要退的菜品')
      return
    }
    if (!reason.trim()) {
      toast('请填写退款原因')
      return
    }
    if (overLimit) {
      toast(`所选金额超过可退余额 ¥${formatYuan(refundableAmount)}`)
      return
    }
    onSubmit(
      reason.trim(),
      allSelected ? [] : selected.map((x) => ({ orderItemId: x.item.id, quantity: qty[x.item.id] })),
    )
  }

  return (
    <View className='popup-mask' onClick={onClose}>
      <View className='rp' onClick={(e) => e.stopPropagation()}>
        <View className='rp-head'>
          <Text className='rp-title'>申请退款</Text>
          <Text className='rp-all' onClick={toggleAll}>{allSelected ? '取消全选' : '整单退款'}</Text>
        </View>
        {refundable.map(({ item, max }) => (
          <View key={item.id} className='rp-row'>
            <View className='rp-info'>
              <Text className='rp-name'>{item.dishName}</Text>
              <Text className='rp-desc'>
                {[item.specDesc, item.addonDesc].filter(Boolean).join(' · ')}
                {' '}¥{formatYuan(item.unitPrice)} × 可退 {max}
              </Text>
            </View>
            <Stepper
              value={qty[item.id] ?? 0}
              compact={false}
              onMinus={() => change(item.id, max, -1)}
              onPlus={() => change(item.id, max, 1)}
            />
          </View>
        ))}
        <Input
          className='rp-reason'
          value={reason}
          maxlength={100}
          placeholder='请填写退款原因'
          onInput={(e) => setReason(e.detail.value)}
        />
        <View className='rp-foot'>
          <Text className='rp-amount'>退款金额 ¥{formatYuan(amount)}{overLimit ? `（可退 ¥${formatYuan(refundableAmount)}）` : ''}</Text>
          <View className={`rp-submit ${selected.length && !overLimit ? '' : 'disabled'}`} onClick={submit}>
            <Text>提交申请</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
