'use client'

import { Badge, Popup, Stepper } from 'antd-mobile'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { itemOptionsText, yuan } from '@/lib/format'
import { confirmDialog, getAppShell } from '@/lib/ui'
import { cartCount, cartTotal, itemMax, useOrdering } from '@/store/ordering'

/** 底部购物车栏：点击展开已选商品，可改数量 / 清空；展开时底栏浮在列表上方，可直接结算；打烊时不能结算 */
export function CartBar({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const { items, setQuantity, clear } = useOrdering()
  const [open, setOpen] = useState(false)
  const count = cartCount(items)

  const clearCart = async () => {
    if (!(await confirmDialog('清空购物车', '确认清空已选的全部商品？', '清空'))) return
    clear()
    setOpen(false)
  }

  return <>
    <Popup
      visible={open && count > 0}
      position="bottom"
      getContainer={getAppShell}
      bodyStyle={{ borderRadius: '20px 20px 0 0' }}
      onMaskClick={() => setOpen(false)}
    >
      <div className="sheet cart-sheet">
        <div className="cart-sheet-head">
          <span>已选商品</span>
          <button className="soft-link" onClick={clearCart}>清空</button>
        </div>
        <div className="cart-sheet-list">
          {items.map((item) => (
            <div className="cart-sheet-row" key={item.key}>
              <div className="row-main">
                <div className="cart-item-name">{item.name}</div>
                <div className="muted">{itemOptionsText(item)}</div>
              </div>
              <strong>¥{yuan(item.unitPrice * item.quantity)}</strong>
              <Stepper min={0} max={itemMax(items, item)} value={item.quantity} onChange={(value) => setQuantity(item.key, value)} />
            </div>
          ))}
        </div>
      </div>
    </Popup>
    <div className={`cart-bar ${open && count > 0 ? 'raised' : ''}`}>
      <div className="cart-summary" onClick={() => count && setOpen((v) => !v)}>
        <Badge content={count || null}>
          <div className="cart-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H7" />
              <circle cx="9.5" cy="20" r="1.3" /><circle cx="17.5" cy="20" r="1.3" />
            </svg>
          </div>
        </Badge>
        <span className="cart-amount">{count ? `¥${yuan(cartTotal(items))}` : '未选购商品'}</span>
      </div>
      <button className="checkout-button" disabled={!count || disabled} onClick={() => { setOpen(false); router.push('/checkout') }}>
        {disabled ? '已打烊' : '去结算'}
      </button>
    </div>
  </>
}
