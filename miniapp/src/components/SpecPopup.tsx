import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import type { MenuDish } from '../api/types'
import { formatYuan, imageUrl } from '../utils/money'
import { calcUnitPrice, defaultSelection, describeSelection, type Selection, validateSelection } from '../utils/price'
import Stepper from './Stepper'
import './SpecPopup.css'

interface Props {
  dish: MenuDish | null
  onClose: () => void
  onConfirm: (dish: MenuDish, sel: Selection, quantity: number) => void
}

/** 规格 / 加料选择弹层：规格组单选，加料组多选（受 maxCount 限制） */
export default function SpecPopup({ dish, onClose, onConfirm }: Props) {
  const [sel, setSel] = useState<Selection>({ specItemIds: [], addonItemIds: [] })
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (dish) {
      setSel(defaultSelection(dish))
      setQty(1)
    }
  }, [dish])

  if (!dish) {
    return null
  }

  const pickSpec = (groupItemIds: number[], itemId: number, required: boolean) => {
    setSel((s) => {
      const others = s.specItemIds.filter((id) => !groupItemIds.includes(id))
      const already = s.specItemIds.includes(itemId)
      // 非必选组允许再次点击取消
      return { ...s, specItemIds: already && !required ? others : [...others, itemId] }
    })
  }

  const toggleAddon = (groupItemIds: number[], itemId: number, max: number, groupName: string) => {
    setSel((s) => {
      if (s.addonItemIds.includes(itemId)) {
        return { ...s, addonItemIds: s.addonItemIds.filter((id) => id !== itemId) }
      }
      const chosenInGroup = s.addonItemIds.filter((id) => groupItemIds.includes(id))
      if (chosenInGroup.length >= max) {
        if (max === 1) {
          // 单选加料组：直接替换
          return { ...s, addonItemIds: [...s.addonItemIds.filter((id) => !groupItemIds.includes(id)), itemId] }
        }
        Taro.showToast({ title: `${groupName}最多选 ${max} 项`, icon: 'none' })
        return s
      }
      return { ...s, addonItemIds: [...s.addonItemIds, itemId] }
    })
  }

  const confirm = () => {
    const err = validateSelection(dish, sel)
    if (err) {
      Taro.showToast({ title: err, icon: 'none' })
      return
    }
    onConfirm(dish, sel, qty)
  }

  const unitPrice = calcUnitPrice(dish, sel)
  const { specDesc, addonDesc } = describeSelection(dish, sel)

  return (
    <View className='popup-mask' onClick={onClose} catchMove>
      <View className='popup' onClick={(e) => e.stopPropagation()}>
        <View className='popup-head'>
          {dish.image ? <Image className='popup-img' src={imageUrl(dish.image)} mode='aspectFill' /> : <View className='popup-img' />}
          <View className='popup-title'>
            <Text className='popup-name'>{dish.name}</Text>
            <Text className='popup-price'>¥{formatYuan(unitPrice)}</Text>
            <Text className='popup-desc'>{[specDesc, addonDesc].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text className='popup-close' onClick={onClose}>×</Text>
        </View>

        <ScrollView scrollY className='popup-body'>
          {dish.specGroups.map((g) => {
            const ids = g.items.map((i) => i.id)
            return (
              <View key={`s${g.id}`} className='group'>
                <Text className='group-title'>{g.name}{g.required ? '' : '（可不选）'}</Text>
                <View className='chips'>
                  {g.items.map((i) => (
                    <View
                      key={i.id}
                      className={`chip ${sel.specItemIds.includes(i.id) ? 'active' : ''}`}
                      onClick={() => pickSpec(ids, i.id, g.required)}
                    >
                      <Text>{i.name}{i.priceDelta ? ` ${i.priceDelta > 0 ? '+' : '-'}¥${formatYuan(Math.abs(i.priceDelta))}` : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
          {dish.addonGroups.map((g) => {
            const ids = g.items.map((i) => i.id)
            return (
              <View key={`a${g.id}`} className='group'>
                <Text className='group-title'>{g.name}（最多选 {g.maxCount} 项）</Text>
                <View className='chips'>
                  {g.items.map((i) => (
                    <View
                      key={i.id}
                      className={`chip ${sel.addonItemIds.includes(i.id) ? 'active' : ''}`}
                      onClick={() => toggleAddon(ids, i.id, g.maxCount, g.name)}
                    >
                      <Text>{i.name}{i.priceDelta ? ` +¥${formatYuan(i.priceDelta)}` : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
        </ScrollView>

        <View className='popup-foot'>
          <Stepper value={qty} compact={false} onMinus={() => setQty((q) => Math.max(1, q - 1))} onPlus={() => setQty((q) => Math.min(99, q + 1))} />
          <View className='popup-confirm' onClick={confirm}>
            <Text>加入购物车 ¥{formatYuan(unitPrice * qty)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
