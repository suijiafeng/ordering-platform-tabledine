import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Text, Textarea, View } from '@tarojs/components'
import Stepper from '../../components/Stepper'
import { cartCount, cartTotal, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan } from '../../utils/money'
import './index.css'

/**
 * 确认订单：明细、就餐人数、备注、应付金额。
 * 提交订单与支付在第 3 周接入（POST /api/v1/c/orders + 调起支付）。
 */
export default function Checkout() {
  const table = useTableStore((s) => s.current)
  const items = useCartStore((s) => s.items)
  const [people, setPeople] = useState(1)
  const [remark, setRemark] = useState('')

  const submit = () => {
    Taro.showModal({
      title: '提示',
      content: '下单与支付将在第 3 周接入',
      showCancel: false,
    })
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
        <View className={`co-submit ${table.storeOpen ? '' : 'disabled'}`} onClick={() => table.storeOpen && submit()}>
          <Text>{table.storeOpen ? '提交订单' : '已打烊'}</Text>
        </View>
      </View>
    </View>
  )
}
