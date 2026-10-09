'use client'

import { useRef, useState } from 'react'
import { Button, Popup, Stepper } from 'antd-mobile'
import { defaultSelection, selectionDescription, selectionError, unitPrice } from '@/lib/pricing'
import { imageSrc, yuan } from '@/lib/format'
import type { Dish, Selection } from '@/lib/types'
import { notify } from '@/store/feedback'
import { getAppShell } from '@/lib/ui'

interface Props {
  dish: Dish | null
  /** 本次最多还能加的份数（限量菜：剩余库存减去购物车里已有的）；0 表示已达上限 */
  maxQuantity: number
  onClose: () => void
  onConfirm: (dish: Dish, selection: Selection, quantity: number) => void
}

/**
 * 规格 / 加料弹层。dish 为 null 表示关闭：弹层保留上一道菜的内容播放收起动画，
 * 动画结束后销毁表单（destroyOnClose），下次打开时重新初始化选择与数量。
 */
export function SpecSheet({ dish, maxQuantity, onClose, onConfirm }: Props) {
  const lastDish = useRef<Dish | null>(null)
  if (dish) lastDish.current = dish
  const shown = dish ?? lastDish.current
  return (
    <Popup visible={dish !== null} position="bottom" getContainer={getAppShell} bodyStyle={{ borderRadius: '20px 20px 0 0' }} onMaskClick={onClose} showCloseButton onClose={onClose} destroyOnClose>
      {shown && <SpecForm key={shown.id} dish={shown} maxQuantity={maxQuantity} onConfirm={onConfirm} />}
    </Popup>
  )
}

function SpecForm({ dish, maxQuantity, onConfirm }: { dish: Dish; maxQuantity: number; onConfirm: Props['onConfirm'] }) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(dish))
  const [quantity, setQuantity] = useState(1)
  const limited = dish.remainingStock != null
  const exhausted = maxQuantity <= 0
  const total = unitPrice(dish, selection) * quantity
  const desc = selectionDescription(dish, selection)
  const chooseSpec = (groupIds: number[], itemId: number, required: boolean) => setSelection((current) => {
    const remaining = current.specItemIds.filter((id) => !groupIds.includes(id))
    const next = current.specItemIds.includes(itemId) && !required ? remaining : [...remaining, itemId]
    return { ...current, specItemIds: next }
  })
  const chooseAddon = (groupIds: number[], itemId: number, max: number) => setSelection((current) => {
    if (current.addonItemIds.includes(itemId)) return { ...current, addonItemIds: current.addonItemIds.filter((id) => id !== itemId) }
    const selected = current.addonItemIds.filter((id) => groupIds.includes(id))
    if (selected.length >= max) {
      if (max === 1) return { ...current, addonItemIds: [...current.addonItemIds.filter((id) => !groupIds.includes(id)), itemId] }
      notify(`最多选择 ${max} 项`); return current
    }
    return { ...current, addonItemIds: [...current.addonItemIds, itemId] }
  })
  const confirm = () => {
    const error = selectionError(dish, selection)
    if (error) { notify(error); return }
    onConfirm(dish, selection, quantity)
  }
  return (
    <div className="sheet">
      <div className="sheet-head">
        {dish.image ? <img className="sheet-image" src={imageSrc(dish.image)} alt="" /> : <div className="sheet-image" />}
        <div>
          <div className="sheet-title">{dish.name}</div>
          <div className="price" style={{ marginTop: 9 }}>¥{yuan(unitPrice(dish, selection))}</div>
          <div className="muted">{[desc.specDesc, desc.addonDesc].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="sheet-scroll">
        {dish.specGroups.map((group) => (
          <div className="option-group" key={group.id}>
            <div className="option-title">{group.name}{group.required ? '' : '（可不选）'}</div>
            <div className="chips">
              {group.items.map((item) => (
                <button
                  className={`chip ${selection.specItemIds.includes(item.id) ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => chooseSpec(group.items.map((i) => i.id), item.id, group.required)}
                >
                  {item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}
        {dish.addonGroups.map((group) => (
          <div className="option-group" key={group.id}>
            <div className="option-title">{group.name}（最多 {group.maxCount} 项）</div>
            <div className="chips">
              {group.items.map((item) => (
                <button
                  className={`chip ${selection.addonItemIds.includes(item.id) ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => chooseAddon(group.items.map((i) => i.id), item.id, group.maxCount)}
                >
                  {item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {limited && (
        <div className={`stock-note ${exhausted ? 'warning' : 'muted'}`}>
          {exhausted ? `今日仅剩 ${dish.remainingStock} 份，购物车里已经加满` : `今日仅剩 ${dish.remainingStock} 份，本次最多再加 ${maxQuantity} 份`}
        </div>
      )}
      <div className="sheet-foot">
        <Stepper min={1} max={Math.max(1, maxQuantity)} value={quantity} onChange={setQuantity} disabled={exhausted} />
        <Button color="primary" size="large" disabled={exhausted} onClick={confirm}>{exhausted ? '已达上限' : `加入购物车 ¥${yuan(total)}`}</Button>
      </div>
    </div>
  )
}
