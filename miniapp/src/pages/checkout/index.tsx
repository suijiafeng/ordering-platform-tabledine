import { useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, Textarea, View } from '@tarojs/components'
import { createOrder } from '../../api/order'
import Stepper from '../../components/Stepper'
import { cartCount, cartTotal, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan } from '../../utils/money'
import { payOrder } from '../../utils/pay'
import { ignoreShownError } from '../../utils/errors'
import './index.css'
import { toast } from '../../utils/toast'

/**
 * 确认订单：明细、就餐人数、备注、应付金额。
 * 提交订单（服务端重算价格，clientRequestId 幂等）→ 调起支付 → 跳转订单详情确认结果。
 */
export default function Checkout() {
  const table = useTableStore((s) => s.current)
  const items = useCartStore((s) => s.items)
  const [people, setPeople] = useState(1)
  const [remark, setRemark] = useState('')

  const [submitting, setSubmitting] = useState(false)
  // 同一次提交的网络重试复用同一 ID，服务端据此幂等；下单成功后才换新的
  const requestId = useRef(`${Date.now()}${Math.random().toString(36).slice(2, 10)}`)

  const submit = async () => {
    if (submitting || !table?.qrToken) {
      if (!table?.qrToken) toast('桌码已失效，请重新扫码')
      return
    }
    setSubmitting(true)
    let orderNo: string | null = null
    try {
      const order = await createOrder({
        clientRequestId: requestId.current,
        qrToken: table.qrToken,
        items: items.map((i) => ({
          dishId: i.dishId,
          specItemIds: i.specItemIds,
          addonItemIds: i.addonItemIds,
          quantity: i.quantity,
        })),
        peopleCount: people,
        remark: remark.trim() || undefined,
      })
      orderNo = order.orderNo
      requestId.current = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      useCartStore.getState().clear()
      const outcome = await payOrder(orderNo)
      if (outcome === 'cancel') toast('已取消支付，可在订单中继续支付')
      if (outcome === 'fail') toast('支付未完成，可在订单中重试')
    } catch (e) {
      // 请求层已提示。下单失败：保留 requestId，重试时服务端按它幂等，不会重复下单；
      // 发起支付失败：订单已创建，finally 里照样跳到详情页，可在那里继续支付
      ignoreShownError(e)
    } finally {
      setSubmitting(false)
      if (orderNo) void Taro.redirectTo({ url: `/pages/order-detail/index?orderNo=${orderNo}` })
    }
  }

  if (submitting && items.length === 0) {
    // 下单成功后购物车已清空、正在拉起支付：不要闪现「购物车是空的」
    return <View className='co-empty'><Text>正在提交订单…</Text></View>
  }

  if (!table || items.length === 0) {
    return (
      <View className='co-empty'>
        <Text>购物车是空的</Text>
        <Text className='co-link' onClick={() => Taro.navigateBack()}>返回点餐</Text>
      </View>
    )
  }

  return (
    <View className='co-page'>
      <View className='co-card'>
        <Text className='co-store'>{table.storeName}</Text>
        <Text className='co-table'>桌号 {table.tableCode}</Text>
      </View>

      <View className='co-card'>
        {items.map((i) => (
          <View key={i.key} className='co-row'>
            <View className='co-row-info'>
              <Text className='co-row-name'>{i.name}</Text>
              {(i.specDesc || i.addonDesc) && <Text className='co-row-desc'>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Text>}
            </View>
            <Text className='co-row-qty'>x{i.quantity}</Text>
            <Text className='co-row-price'>¥{formatYuan(i.unitPrice * i.quantity)}</Text>
          </View>
        ))}
        <View className='co-sum'>
          <Text>共 {cartCount(items)} 件，合计 </Text>
          <Text className='co-sum-price'>¥{formatYuan(cartTotal(items))}</Text>
        </View>
      </View>

      <View className='co-card'>
        <View className='co-line'>
          <Text>就餐人数</Text>
          <Stepper value={people} compact={false} onMinus={() => setPeople((p) => Math.max(1, p - 1))} onPlus={() => setPeople((p) => Math.min(50, p + 1))} />
        </View>
        <View className='co-line co-remark'>
          <Text>备注</Text>
          <Textarea
            className='co-textarea'
            value={remark}
            maxlength={100}
            placeholder='口味、忌口等（选填）'
            onInput={(e) => setRemark(e.detail.value)}
          />
        </View>
      </View>

      <View className='co-bar'>
        <Text className='co-bar-total'>¥{formatYuan(cartTotal(items))}</Text>
        <View className={`co-submit ${table.storeOpen && !submitting ? '' : 'disabled'}`} onClick={() => table.storeOpen && submit()}>
          <Text>{!table.storeOpen ? '已打烊' : submitting ? '提交中…' : '提交并支付'}</Text>
        </View>
      </View>
    </View>
  )
}
