import { useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { Button, InputNumber, TextArea } from '@nutui/nutui-react-taro'
import { createOrder } from '../../api/order'
import PageShell from '../../components/PageShell'
import { cartCount, cartTotal, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan } from '../../utils/money'
import { payOrder } from '../../utils/pay'
import { goToLogin, isLoggedIn } from '../../utils/auth'
import { ignoreShownError } from '../../utils/errors'
import './index.css'
import { toast } from '../../utils/toast'

/**
 * 确认订单：明细、就餐人数、备注、应付金额。提交时才要求登录会员账号；
 * 下单（服务端重算价格，clientRequestId 幂等）→ 余额支付（发起即扣费入账）→ 订单详情。
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
    if (!isLoggedIn()) {
      // 只在下单时要求登录会员账号，登录成功后回到本页，购物车仍在
      goToLogin('/pages/checkout/index')
      return
    }
    setSubmitting(true)
    let orderNo: string | null = null
    try {
      const order = await createOrder({
        clientRequestId: requestId.current,
        qrToken: table.qrToken,
        items: items.map((i) => ({ dishId: i.dishId, specItemIds: i.specItemIds, addonItemIds: i.addonItemIds, quantity: i.quantity })),
        peopleCount: people,
        remark: remark.trim() || undefined,
      })
      orderNo = order.orderNo
      requestId.current = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      useCartStore.getState().clear()
      const outcome = await payOrder(orderNo)
      if (outcome === 'fail') toast('支付未完成，可在订单中重试')
    } catch (e) {
      // 下单失败：保留 requestId，重试时服务端幂等；支付失败（如余额不足）：订单已创建，去详情页继续
      ignoreShownError(e)
    } finally {
      setSubmitting(false)
      if (orderNo) void Taro.redirectTo({ url: `/pages/order-detail/index?orderNo=${orderNo}` })
    }
  }

  if (submitting && items.length === 0) {
    return <PageShell><View className='co-empty'><Text>正在提交订单…</Text></View></PageShell>
  }

  if (!table || items.length === 0) {
    return (
      <PageShell>
        <View className='co-empty'>
          <Text>购物车是空的</Text>
          <Button size='small' style={{ marginTop: '24px' }} onClick={() => Taro.navigateBack()}>返回点餐</Button>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell>
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
            <InputNumber value={people} min={1} max={50} onChange={(v) => setPeople(Number(v) || 1)} />
          </View>
          <View className='co-line co-remark'>
            <Text>备注</Text>
            <View className='co-textarea'>
              <TextArea value={remark} maxLength={100} showCount placeholder='口味、忌口等（选填）' onChange={(v) => setRemark(v)} />
            </View>
          </View>
        </View>

        <View className='co-bar'>
          <Text className='co-bar-total'>¥{formatYuan(cartTotal(items))}</Text>
          <Button type='primary' size='large' loading={submitting} disabled={!table.storeOpen} onClick={submit}>
            {!table.storeOpen ? '已打烊' : isLoggedIn() ? '余额支付' : '登录并支付'}
          </Button>
        </View>
      </View>
    </PageShell>
  )
}
