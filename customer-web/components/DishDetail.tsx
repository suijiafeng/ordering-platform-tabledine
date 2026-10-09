'use client'

import { useRef } from 'react'
import { Button, Popup } from 'antd-mobile'
import { imageSrc, yuan } from '@/lib/format'
import { hasOptions } from '@/lib/pricing'
import { getAppShell } from '@/lib/ui'
import type { Dish } from '@/lib/types'

interface Props { dish: Dish | null; onClose: () => void; onAdd: (dish: Dish) => void }

/** 菜品详情：大图 + 完整介绍（列表里介绍只显示两行）。dish 为 null 表示关闭，收起动画期间保留上一道菜 */
export function DishDetail({ dish, onClose, onAdd }: Props) {
  const lastDish = useRef<Dish | null>(null)
  if (dish) lastDish.current = dish
  const shown = dish ?? lastDish.current
  return (
    <Popup visible={dish !== null} position="bottom" getContainer={getAppShell} bodyStyle={{ borderRadius: '20px 20px 0 0' }} onMaskClick={onClose} showCloseButton onClose={onClose}>
      {shown && (
        <div className="sheet dish-detail">
          {shown.image ? <img className="dish-detail-image" src={imageSrc(shown.image)} alt={shown.name} /> : <div className="dish-detail-image dish-placeholder" />}
          <div className="dish-detail-body">
            <div className="sheet-title">{shown.name}</div>
            {shown.remainingStock != null && !shown.soldOut && <div className="stock-hint">今日限量，仅剩 {shown.remainingStock} 份</div>}
            {shown.description && <p className="dish-detail-desc">{shown.description}</p>}
          </div>
          <div className="sheet-foot">
            <span className="price">¥{yuan(shown.price)}{hasOptions(shown) && <small>起</small>}</span>
            {shown.soldOut
              ? <Button size="large" disabled>已售罄</Button>
              : <Button color="primary" size="large" onClick={() => onAdd(shown)}>{hasOptions(shown) ? '选规格' : '加入购物车'}</Button>}
          </div>
        </div>
      )}
    </Popup>
  )
}
