'use client'

import { useRef } from 'react'
import { Popup } from 'antd-mobile'
import { imageSrc, yuan } from '@/lib/format'
import { hasOptions } from '@/lib/pricing'
import { getAppShell } from '@/lib/ui'
import type { Dish } from '@/lib/types'
import { PillButton, Price, Tile } from './ui'

interface Props { dish: Dish | null; onClose: () => void; onAdd: (dish: Dish) => void }

/** 菜品详情：大图 + 完整介绍（列表里介绍只显示两行）。dish 为 null 表示关闭，收起动画期间保留上一道菜 */
export function DishDetail({ dish, onClose, onAdd }: Props) {
  const last = useRef<Dish | null>(null)
  if (dish) last.current = dish
  const shown = dish ?? last.current
  return (
    <Popup visible={dish !== null} position="bottom" getContainer={getAppShell} bodyStyle={{ background: 'transparent' }} onMaskClick={onClose}>
      <div className="sheet">
        <div className="sheet-grip" />
        {shown && (
          <div className="sheet-pad">
            <Tile name={shown.name} image={shown.image ? imageSrc(shown.image) : null} className="detail-art" />
            <div className="spec-name" style={{ marginTop: 16 }}>{shown.name}</div>
            {shown.remainingStock != null && !shown.soldOut && <div className="spec-meta">今日限量，仅剩 {shown.remainingStock} 份</div>}
            {shown.description && <p className="detail-desc">{shown.description}</p>}
            <div className="sheet-foot">
              <Price value={yuan(shown.price)} suffix={hasOptions(shown) ? '起' : undefined} />
              {shown.soldOut
                ? <PillButton size="lg" variant="plain" disabled>已售罄</PillButton>
                : <PillButton size="lg" onClick={() => onAdd(shown)}>{hasOptions(shown) ? '选规格' : '加入购物车'}</PillButton>}
            </div>
          </div>
        )}
      </div>
    </Popup>
  )
}
