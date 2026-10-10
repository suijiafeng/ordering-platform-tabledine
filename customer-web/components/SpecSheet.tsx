'use client'

import { useRef, useState } from 'react'
import { Popup } from 'antd-mobile'
import { defaultSelection, selectionDescription, selectionError, unitPrice } from '@/lib/pricing'
import { imageSrc, yuan } from '@/lib/format'
import type { Dish, Selection } from '@/lib/types'
import { notify } from '@/store/feedback'
import { getAppShell } from '@/lib/ui'
import { Chip, PillButton, Price, Stepper, Tile } from './ui'

interface Props {
  dish: Dish | null
  /** 本次最多还能加的份数（限量菜：剩余库存减去购物车里已有的）；0 表示已达上限 */
  maxQuantity: number
  onClose: () => void
  onConfirm: (dish: Dish, selection: Selection, quantity: number) => void
}

/**
 * 规格 / 加料弹层。dish 为 null 表示关闭：弹层保留上一道菜的内容播放收起动画，
 * 动画结束后销毁表单，下次打开时重新初始化选择与数量。
 */
export function SpecSheet({ dish, maxQuantity, onClose, onConfirm }: Props) {
  const last = useRef<Dish | null>(null)
  if (dish) last.current = dish
  const shown = dish ?? last.current
  return (
    <Popup visible={dish !== null} position="bottom" getContainer={getAppShell} bodyStyle={{ background: 'transparent' }} onMaskClick={onClose} destroyOnClose>
      <div className="sheet">
        <div className="sheet-grip" />
        {shown && <SpecForm key={shown.id} dish={shown} maxQuantity={maxQuantity} onConfirm={onConfirm} />}
      </div>
    </Popup>
  )
}

function SpecForm({ dish, maxQuantity, onConfirm }: { dish: Dish; maxQuantity: number; onConfirm: Props['onConfirm'] }) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(dish))
  const [quantity, setQuantity] = useState(1)
  const exhausted = maxQuantity <= 0
  const desc = selectionDescription(dish, selection)
  const total = unitPrice(dish, selection) * quantity

  const chooseSpec = (groupIds: number[], itemId: number, required: boolean) => setSelection((current) => {
    const remaining = current.specItemIds.filter((id) => !groupIds.includes(id))
    return { ...current, specItemIds: current.specItemIds.includes(itemId) && !required ? remaining : [...remaining, itemId] }
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
    <div className="sheet-pad">
      <div className="spec-head">
        <Tile name={dish.name} image={dish.image ? imageSrc(dish.image) : null} />
        <div>
          <div className="spec-name">{dish.name}</div>
          {dish.description && <div className="spec-meta">{dish.description}</div>}
          <div className="spec-price"><Price value={yuan(unitPrice(dish, selection))} /></div>
        </div>
      </div>

      <div className="sheet-scroll">
        {dish.specGroups.map((group) => (
          <div className="spec-group" key={group.id}>
            <div className="label">{group.name}{group.required ? '' : '（可不选）'}</div>
            <div className="chips">
              {group.items.map((item) => (
                <Chip key={item.id} on={selection.specItemIds.includes(item.id)} onClick={() => chooseSpec(group.items.map((i) => i.id), item.id, group.required)}>
                  {item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        {dish.addonGroups.map((group) => (
          <div className="spec-group" key={group.id}>
            <div className="label">{group.name}（最多 {group.maxCount} 项）</div>
            <div className="chips">
              {group.items.map((item) => (
                <Chip key={item.id} on={selection.addonItemIds.includes(item.id)} onClick={() => chooseAddon(group.items.map((i) => i.id), item.id, group.maxCount)}>
                  {item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(desc.specDesc || desc.addonDesc) && (
        <div className="spec-selected">已选：{[desc.specDesc, desc.addonDesc].filter(Boolean).join(' · ')} ×{quantity}</div>
      )}
      {dish.remainingStock != null && (
        <div className={`spec-selected ${exhausted ? 'danger' : ''}`.trim()}>
          {exhausted ? `今日仅剩 ${dish.remainingStock} 份，购物车里已经加满` : `今日仅剩 ${dish.remainingStock} 份，本次最多再加 ${maxQuantity} 份`}
        </div>
      )}
      <div className="sheet-foot">
        <Stepper value={quantity} min={1} max={Math.max(1, maxQuantity)} onChange={setQuantity} />
        <PillButton className="grow" size="lg" disabled={exhausted} onClick={confirm}>
          {exhausted ? '已达上限' : `加入购物车 · ¥${yuan(total)}`}
        </PillButton>
      </div>
    </div>
  )
}
