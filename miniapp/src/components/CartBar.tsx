import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { cartCount, cartTotal, useCartStore } from '../store/cart'
import { formatYuan } from '../utils/money'
import Stepper from './Stepper'
import './CartBar.css'

interface Props {
  disabled?: boolean
  disabledText?: string
  onCheckout: () => void
}

/** 底部购物车栏 + 展开的购物车明细 */
export default function CartBar({ disabled, disabledText, onCheckout }: Props) {
  const { items, changeQty, clear } = useCartStore()
  const [open, setOpen] = useState(false)
  const count = cartCount(items)
  const total = cartTotal(items)

  return (
    <>
      {open && count > 0 && (
        <View className='cart-mask' onClick={() => setOpen(false)} catchMove>
          <View className='cart-panel' onClick={(e) => e.stopPropagation()}>
            <View className='cart-panel-head'>
              <Text>已选商品</Text>
              <Text className='cart-clear' onClick={() => { clear(); setOpen(false) }}>清空</Text>
            </View>
            <ScrollView scrollY className='cart-list'>
              {items.map((i) => (
                <View key={i.key} className='cart-row'>
                  <View className='cart-row-info'>
                    <Text className='cart-row-name'>{i.name}</Text>
                    {(i.specDesc || i.addonDesc) && (
                      <Text className='cart-row-desc'>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Text>
                    )}
                  </View>
                  <Text className='cart-row-price'>¥{formatYuan(i.unitPrice * i.quantity)}</Text>
                  <Stepper value={i.quantity} compact={false} onMinus={() => changeQty(i.key, -1)} onPlus={() => changeQty(i.key, 1)} />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
      <View className='cart-bar'>
        <View className='cart-left' onClick={() => count > 0 && setOpen(!open)}>
          <View className={`cart-icon ${count > 0 ? 'active' : ''}`}>
            <Text>🛒</Text>
            {count > 0 && <Text className='cart-badge'>{count}</Text>}
          </View>
          <Text className='cart-total'>{count > 0 ? `¥${formatYuan(total)}` : '未选购商品'}</Text>
        </View>
        <View
          className={`cart-submit ${count === 0 || disabled ? 'disabled' : ''}`}
          onClick={() => !disabled && count > 0 && onCheckout()}
        >
          <Text>{disabled ? disabledText : '去结算'}</Text>
        </View>
      </View>
    </>
  )
}
