import { useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import { Button, Input, InputNumber, Popup } from '@nutui/nutui-react-taro'
import type { OrderItemView } from '../api/types'
import { formatYuan } from '../utils/money'
import './RefundPopup.css'
import { toast } from '../utils/toast'

interface Props {
  visible: boolean
  items: OrderItemView[]
  /** 后端的可退余额（实付 − 已退） */
  refundableAmount: number
  onClose: () => void
  /** selection 为空数组表示整单 */
  onSubmit: (reason: string, selection: { orderItemId: number; quantity: number }[]) => void
}

/** 申请退款：按菜品选择退几份（可退 = 购买数量 - 已退数量），全部选满即整单退款 */
export default function RefundPopup({ visible, items, refundableAmount, onClose, onSubmit }: Props) {
  const refundable = useMemo(() => items.map((i) => ({ item: i, max: i.quantity - i.refundedQty })).filter((x) => x.max > 0), [items])
  const [qty, setQty] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')

  const selected = refundable.filter((x) => (qty[x.item.id] ?? 0) > 0)
  const itemsAmount = selected.reduce((s, x) => s + x.item.unitPrice * qty[x.item.id], 0)
  const allSelected = refundable.length > 0 && refundable.every((x) => qty[x.item.id] === x.max)
  const amount = allSelected ? Math.min(itemsAmount, refundableAmount) : itemsAmount
  const overLimit = !allSelected && itemsAmount > refundableAmount

  const submit = () => {
    if (selected.length === 0) return toast('请选择要退的菜品')
    if (!reason.trim()) return toast('请填写退款原因')
    if (overLimit) return toast(`所选金额超过可退余额 ¥${formatYuan(refundableAmount)}`)
    onSubmit(reason.trim(), allSelected ? [] : selected.map((x) => ({ orderItemId: x.item.id, quantity: qty[x.item.id] })))
  }

  return (
    <Popup visible={visible} position='bottom' round closeable onClose={onClose}>
      <View className='rp'>
        <View className='rp-head'>
          <Text className='rp-title'>申请退款</Text>
          <Text className='rp-all' onClick={() => setQty(allSelected ? {} : Object.fromEntries(refundable.map((x) => [x.item.id, x.max])))}>{allSelected ? '取消全选' : '整单退款'}</Text>
        </View>
        {refundable.map(({ item, max }) => (
          <View key={item.id} className='rp-row'>
            <View className='rp-info'>
              <Text className='rp-name'>{item.dishName}</Text>
              <Text className='rp-desc'>{[item.specDesc, item.addonDesc].filter(Boolean).join(' · ')} ¥{formatYuan(item.unitPrice)} × 可退 {max}</Text>
            </View>
            <InputNumber value={qty[item.id] ?? 0} min={0} max={max} onChange={(v) => setQty((q) => ({ ...q, [item.id]: Number(v) || 0 }))} />
          </View>
        ))}
        <View className='rp-reason'>
          <Input value={reason} maxLength={100} placeholder='请填写退款原因' onChange={(v) => setReason(v)} />
        </View>
        <View className='rp-foot'>
          <Text className='rp-amount'>退款金额 ¥{formatYuan(amount)}{overLimit ? `（可退 ¥${formatYuan(refundableAmount)}）` : ''}</Text>
          <Button type='primary' disabled={selected.length === 0 || overLimit} onClick={submit}>提交申请</Button>
        </View>
      </View>
    </Popup>
  )
}
