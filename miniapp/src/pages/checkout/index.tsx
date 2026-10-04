<<<<<<< HEAD
<<<<<<< HEAD
import { useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, Textarea, View } from '@tarojs/components'
import { createOrder } from '../../api/order'
=======
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, Textarea, View } from '@tarojs/components'
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
import { useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, Textarea, View } from '@tarojs/components'
import { createOrder } from '../../api/order'
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
import Stepper from '../../components/Stepper'
import { cartCount, cartTotal, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan } from '../../utils/money'
<<<<<<< HEAD
<<<<<<< HEAD
import { payOrder } from '../../utils/pay'
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
import { payOrder } from '../../utils/pay'
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
import './index.css'

/**
 * 确认订单：明细、就餐人数、备注、应付金额。
<<<<<<< HEAD
<<<<<<< HEAD
 * 提交订单（服务端重算价格，clientRequestId 幂等）→ 调起支付 → 跳转订单详情确认结果。
=======
 * 提交订单与支付在第 3 周接入（POST /api/v1/c/orders + 调起支付）。
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
 * 提交订单（服务端重算价格，clientRequestId 幂等）→ 调起支付 → 跳转订单详情确认结果。
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
 */
export default function Checkout() {
  const table = useTableStore((s) => s.current)
  const items = useCartStore((s) => s.items)
  const [people, setPeople] = useState(1)
  const [remark, setRemark] = useState('')

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
  const [submitting, setSubmitting] = useState(false)
  // 同一次提交的网络重试复用同一 ID，服务端据此幂等；下单成功后才换新的
  const requestId = useRef(`${Date.now()}${Math.random().toString(36).slice(2, 10)}`)

  const submit = async () => {
    if (submitting || !table?.qrToken) {
      if (!table?.qrToken) Taro.showToast({ title: '桌码已失效，请重新扫码', icon: 'none' })
      return
    }
    setSubmitting(true)
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
      requestId.current = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      useCartStore.getState().clear()
      const outcome = await payOrder(order.orderNo)
      if (outcome === 'cancel') Taro.showToast({ title: '已取消支付，可在订单中继续支付', icon: 'none' })
      if (outcome === 'fail') Taro.showToast({ title: '支付未完成，可在订单中重试', icon: 'none' })
      Taro.redirectTo({ url: `/pages/order-detail/index?orderNo=${order.orderNo}` })
    } catch {
      // request 层已提示错误；订单可能已创建，保留 requestId 便于重试幂等
    } finally {
      setSubmitting(false)
    }
<<<<<<< HEAD
=======
  const submit = () => {
    Taro.showModal({
      title: '提示',
      content: '下单与支付将在第 3 周接入',
      showCancel: false,
    })
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
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
<<<<<<< HEAD
<<<<<<< HEAD
        <View className={`co-submit ${table.storeOpen && !submitting ? '' : 'disabled'}`} onClick={() => table.storeOpen && submit()}>
          <Text>{!table.storeOpen ? '已打烊' : submitting ? '提交中…' : '提交并支付'}</Text>
=======
        <View className={`co-submit ${table.storeOpen ? '' : 'disabled'}`} onClick={() => table.storeOpen && submit()}>
          <Text>{table.storeOpen ? '提交订单' : '已打烊'}</Text>
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
        <View className={`co-submit ${table.storeOpen && !submitting ? '' : 'disabled'}`} onClick={() => table.storeOpen && submit()}>
          <Text>{!table.storeOpen ? '已打烊' : submitting ? '提交中…' : '提交并支付'}</Text>
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
        </View>
      </View>
    </View>
  )
}
