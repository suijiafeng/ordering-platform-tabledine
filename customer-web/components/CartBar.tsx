'use client'

import { Popup } from 'antd-mobile'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { imageSrc, itemOptionsText, yuan } from '@/lib/format'
import { confirmDialog, getAppShell } from '@/lib/ui'
import { cartCount, cartTotal, itemMax, useOrdering } from '@/store/ordering'
import { CartIcon, CloseIcon, PillButton, Price, Stepper, Tile } from './ui'

/** 底部购物车栏：点击展开已选商品，可改数量 / 清空；展开时底栏浮在列表上方，可直接下单；打烊时不能下单 */
export function CartBar({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const { table, items, setQuantity, clear } = useOrdering()
  const [open, setOpen] = useState(false)
  const count = cartCount(items)
  const showList = open && count > 0

  const clearCart = async () => {
    if (!(await confirmDialog('确定清空购物车吗？', '已选的菜品都会被移除', '确定清空'))) return
    clear()
    setOpen(false)
  }

  return <>
    <Popup destroyOnClose visible={showList} position="bottom" getContainer={getAppShell} bodyStyle={{ background: 'transparent' }} onMaskClick={() => setOpen(false)}>
      <div className="sheet">
        <div className="sheet-head">
          <span className="t-title">已选菜品</span>
          <div className="sheet-head-actions">
            <button className="text-action" onClick={clearCart}>清空</button>
            <button className="icon-button" aria-label="关闭购物车" onClick={() => setOpen(false)}><CloseIcon /></button>
          </div>
        </div>
        <div className="sheet-strip">
          <span>{table ? `${table.tableCode}桌 · 堂食` : ''}</span>
          <span>共 {count} 件</span>
        </div>
        <div className="sheet-scroll cart-items">
          {items.map((item) => (
            <div className="cart-row" key={item.key}>
              <Tile name={item.name} image={item.image ? imageSrc(item.image) : null} />
              <div>
                <div className="name">{item.name}</div>
                {itemOptionsText(item) && <div className="t-cap">{itemOptionsText(item)}</div>}
                <div className="unit">¥{yuan(item.unitPrice)} / 份</div>
              </div>
              <Stepper label={item.name} value={item.quantity} min={0} max={itemMax(items, item)} onChange={(value) => setQuantity(item.key, value)} />
            </div>
          ))}
        </div>
      </div>
    </Popup>

    <div className={`cart-bar ${showList ? 'lifted' : ''}`.trim()}>
      <button className="cart-open" disabled={!count} onClick={() => setOpen((v) => !v)} aria-label={`查看购物车，已选 ${count} 件`} aria-expanded={showList}>
        <span className={`cart-ball ${count ? '' : 'empty'}`.trim()}>
          <CartIcon />
          {count > 0 && <span className="cart-badge">{count}</span>}
        </span>
        <span className="cart-sum">
          <span className="value">{count ? <Price value={yuan(cartTotal(items))} /> : '还没选菜'}</span>
          <span className="sub">{count ? `共 ${count} 件，点击查看` : '先去挑几道菜吧'}</span>
        </span>
      </button>
      <PillButton size="md" disabled={!count || disabled} onClick={() => { setOpen(false); router.push('/checkout') }}>
        {disabled ? '已打烊' : '去结算'}
      </PillButton>
    </div>
  </>
}
