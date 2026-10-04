'use client'

import { useEffect, useState } from 'react'
import { Button, Popup, Stepper } from 'antd-mobile'
import { defaultSelection, selectionDescription, selectionError, unitPrice } from '@/lib/pricing'
import { imageSrc, yuan } from '@/lib/format'
import type { Dish, Selection } from '@/lib/types'
import { notify } from '@/store/feedback'
import { getAppShell } from '@/lib/ui'

export function SpecSheet({ dish, onClose, onConfirm }: { dish: Dish | null; onClose: () => void; onConfirm: (dish: Dish, selection: Selection, quantity: number) => void }) {
  const [selection, setSelection] = useState<Selection>({ specItemIds: [], addonItemIds: [] })
  const [quantity, setQuantity] = useState(1)
  useEffect(() => { if (dish) { setSelection(defaultSelection(dish)); setQuantity(1) } }, [dish])
  if (!dish) return <Popup visible={false} getContainer={getAppShell} />
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
  return <Popup visible position="bottom" getContainer={getAppShell} bodyStyle={{ borderRadius: '20px 20px 0 0' }} onMaskClick={onClose} showCloseButton onClose={onClose}>
    <div className="sheet">
      <div className="sheet-head">
        {dish.image ? <img className="sheet-image" src={imageSrc(dish.image)} alt="" /> : <div className="sheet-image" />}
        <div><div className="sheet-title">{dish.name}</div><div className="price" style={{ marginTop: 9 }}>¥{yuan(unitPrice(dish, selection))}</div><div className="muted">{[desc.specDesc, desc.addonDesc].filter(Boolean).join(' · ')}</div></div>
      </div>
      <div className="sheet-scroll">
        {dish.specGroups.map((group) => <div className="option-group" key={group.id}>
          <div className="option-title">{group.name}{group.required ? '' : '（可不选）'}</div>
          <div className="chips">{group.items.map((item) => <button className={`chip ${selection.specItemIds.includes(item.id) ? 'active' : ''}`} key={item.id} onClick={() => chooseSpec(group.items.map((i) => i.id), item.id, group.required)}>{item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}</button>)}</div>
        </div>)}
        {dish.addonGroups.map((group) => <div className="option-group" key={group.id}>
          <div className="option-title">{group.name}（最多 {group.maxCount} 项）</div>
          <div className="chips">{group.items.map((item) => <button className={`chip ${selection.addonItemIds.includes(item.id) ? 'active' : ''}`} key={item.id} onClick={() => chooseAddon(group.items.map((i) => i.id), item.id, group.maxCount)}>{item.name}{item.priceDelta ? ` +¥${yuan(item.priceDelta)}` : ''}</button>)}</div>
        </div>)}
      </div>
      <div className="sheet-foot"><Stepper min={1} max={99} value={quantity} onChange={setQuantity} /><Button color="primary" size="large" onClick={() => { const error = selectionError(dish, selection); if (error) { notify(error); return } onConfirm(dish, selection, quantity) }}>加入购物车 ¥{yuan(total)}</Button></div>
    </div>
  </Popup>
}
