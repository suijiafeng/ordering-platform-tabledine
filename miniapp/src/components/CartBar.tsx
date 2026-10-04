import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { Badge, InputNumber, Popup } from '@nutui/nutui-react-taro'
import { cartCount, cartTotal, useCartStore } from '../store/cart'
import { formatYuan } from '../utils/money'
import './CartBar.css'

interface Props {
  disabled?: boolean
  disabledText?: string
  onCheckout: () => void
}

/** 底部购物车栏 + 展开的购物车明细（NutUI Popup） */
export default function CartBar({ disabled, disabledText, onCheckout }: Props) {
  const { items, changeQty, clear } = useCartStore()
  const [open, setOpen] = useState(false)
  const count = cartCount(items)
  const total = cartTotal(items)

  return (
    <>
      <Popup visible={open && count > 0} position='bottom' round onClose={() => setOpen(false)}>
        <View className='cart-panel'>
          <View className='cart-panel-head'>
            <Text>已选商品</Text>
            <Text className='cart-clear' onClick={() => { clear(); setOpen(false) }}>清空</Text>
          </View>
          <ScrollView scrollY className='cart-list'>
            {items.map((i) => (
              <View key={i.key} className='cart-row'>
                <View className='cart-row-info'>
                  <Text className='cart-row-name'>{i.name}</Text>
                  {(i.specDesc || i.addonDesc) && <Text className='cart-row-desc'>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Text>}
                </View>
                <Text className='cart-row-price'>¥{formatYuan(i.unitPrice * i.quantity)}</Text>
                <InputNumber value={i.quantity} min={0} max={99} onChange={(v) => changeQty(i.key, (Number(v) || 0) - i.quantity)} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Popup>
      <View className='cart-bar'>
        <View className='cart-left' onClick={() => count > 0 && setOpen(!open)}>
          <Badge value={count > 0 ? count : undefined}>
            <View className={`cart-icon ${count > 0 ? 'active' : ''}`}><Text>🛒</Text></View>
          </Badge>
          <Text className='cart-total'>{count > 0 ? `¥${formatYuan(total)}` : '未选购商品'}</Text>
        </View>
        <View className={`cart-submit ${count === 0 || disabled ? 'disabled' : ''}`} onClick={() => !disabled && count > 0 && onCheckout()}>
          <Text>{disabled ? disabledText : '去结算'}</Text>
        </View>
      </View>
    </>
  )
}
