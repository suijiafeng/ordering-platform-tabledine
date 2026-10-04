import { useEffect, useState } from 'react'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import { Button, InputNumber, Popup } from '@nutui/nutui-react-taro'
import type { MenuDish } from '../api/types'
import { formatYuan, imageUrl } from '../utils/money'
import { calcUnitPrice, defaultSelection, describeSelection, type Selection, validateSelection } from '../utils/price'
import './SpecPopup.css'
import { toast } from '../utils/toast'

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
          return { ...s, addonItemIds: [...s.addonItemIds.filter((id) => !groupItemIds.includes(id)), itemId] }
        }
        toast(`${groupName}最多选 ${max} 项`)
        return s
      }
      return { ...s, addonItemIds: [...s.addonItemIds, itemId] }
    })
  }

  const confirm = () => {
    if (!dish) return
    const err = validateSelection(dish, sel)
    if (err) {
      toast(err)
      return
    }
    onConfirm(dish, sel, qty)
  }

  const unitPrice = dish ? calcUnitPrice(dish, sel) : 0
  const { specDesc, addonDesc } = dish ? describeSelection(dish, sel) : { specDesc: '', addonDesc: '' }

  return (
    <Popup visible={dish !== null} position='bottom' round closeable onClose={onClose} className='spec-popup'>
      {dish && (
        <View className='popup'>
          <View className='popup-head'>
            {dish.image ? <Image className='popup-img' src={imageUrl(dish.image)} mode='aspectFill' /> : <View className='popup-img' />}
            <View className='popup-title'>
              <Text className='popup-name'>{dish.name}</Text>
              {dish.description && <Text className='popup-intro'>{dish.description}</Text>}
              <Text className='popup-price'>¥{formatYuan(unitPrice)}</Text>
              <Text className='popup-desc'>{[specDesc, addonDesc].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>

          <ScrollView scrollY className='popup-body'>
            {dish.specGroups.map((g) => {
              const ids = g.items.map((i) => i.id)
              return (
                <View key={`s${g.id}`} className='group'>
                  <Text className='group-title'>{g.name}{g.required ? '' : '（可不选）'}</Text>
                  <View className='chips'>
                    {g.items.map((i) => (
                      <View key={i.id} className={`chip ${sel.specItemIds.includes(i.id) ? 'active' : ''}`} onClick={() => pickSpec(ids, i.id, g.required)}>
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
                      <View key={i.id} className={`chip ${sel.addonItemIds.includes(i.id) ? 'active' : ''}`} onClick={() => toggleAddon(ids, i.id, g.maxCount, g.name)}>
                        <Text>{i.name}{i.priceDelta ? ` +¥${formatYuan(i.priceDelta)}` : ''}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}
          </ScrollView>

          <View className='popup-foot'>
            <InputNumber value={qty} min={1} max={99} onChange={(v) => setQty(Number(v) || 1)} />
            <Button type='primary' size='large' onClick={confirm}>加入购物车 ¥{formatYuan(unitPrice * qty)}</Button>
          </View>
        </View>
      )}
    </Popup>
  )
}
