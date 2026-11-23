'use client'

import { Popup } from 'antd-mobile'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { imageSrc, itemOptionsText, yuan } from '@/lib/format'
import { confirmDialog, getAppShell } from '@/lib/ui'
import { getToken } from '@/lib/auth'
import { cartCount, cartTotal, itemMax, useOrdering } from '@/store/ordering'
import { useMemberBalance } from '@/hooks/useMemberBalance'
import { CartIcon, CloseIcon, PillButton, Price, Stepper, Tile } from './ui'

function CartItemList({ items, setQuantity }: {
  items: ReturnType<typeof useOrdering.getState>['items']
  setQuantity: (key: string, value: number) => void
}) {
  return (
    <>
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
    </>
  )
}

function BalanceHint({ count, total, loggedIn, balance }: { count: number; total: number; loggedIn: boolean; balance: number | null }) {
  if (!count) return <span className="sub">先去挑几道菜吧</span>
  if (loggedIn && balance !== null) {
    const remain = balance - total
    return <span className="sub">余额 ¥{yuan(balance)} · 支付后剩 ¥{yuan(remain)}</span>
  }
  if (loggedIn) return <span className="sub">共 {count} 件，登录余额支付</span>
  return <span className="sub">共 {count} 件，登录后余额支付</span>
}

/** 底部悬浮购物车（手机/平板）与宽屏常驻购物车面板共用同一份状态 */
export function CartBar({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const { table, items, setQuantity, clear } = useOrdering()
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => { setLoggedIn(getToken() != null) }, [])
  const { balance } = useMemberBalance(loggedIn)
  const count = cartCount(items)
  const total = cartTotal(items)
  const showList = open && count > 0

  const clearCart = async () => {
    if (!(await confirmDialog('确定清空购物车吗？', '已选的菜品都会被移除', '确定清空'))) return
    clear()
    setOpen(false)
  }

  const checkout = () => { setOpen(false); router.push('/checkout') }
  const checkoutLabel = disabled ? '已打烊' : '去结算'

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
          <CartItemList items={items} setQuantity={setQuantity} />
        </div>
      </div>
    </Popup>

    <aside className="cart-panel" aria-label="已选菜品">
      <div className="cart-panel-head">
        <span className="t-title">已选菜品</span>
        {count > 0 && <button className="text-action" onClick={clearCart}>清空</button>}
      </div>
      <div className="cart-panel-body cart-items">
        {count ? <CartItemList items={items} setQuantity={setQuantity} /> : <div className="cart-panel-empty">还没选菜，先去挑几道吧</div>}
      </div>
      <div className="cart-panel-foot">
        <div className="kv"><span>小计</span><span>{count ? <Price value={yuan(total)} /> : '¥0'}</span></div>
        {loggedIn && balance !== null && (
          <>
            <div className="kv"><span>余额</span><span>¥{yuan(balance)}</span></div>
            <div className="kv"><span>支付后剩余</span><span>¥{yuan(balance - total)}</span></div>
          </>
        )}
        <div className="kv strong"><span>应付</span><span>{count ? <Price value={yuan(total)} /> : '¥0'}</span></div>
        <PillButton size="md" block disabled={!count || disabled} onClick={checkout}>{checkoutLabel}</PillButton>
      </div>
    </aside>

    <div className={`cart-bar ${showList ? 'lifted' : ''}`.trim()}>
      <button className="cart-open" disabled={!count} onClick={() => setOpen((v) => !v)} aria-label={count ? `查看购物车，已选 ${count} 件` : '查看购物车'} aria-expanded={showList}>
        <span className={`cart-ball ${count ? '' : 'empty'}`.trim()}>
          <CartIcon />
          {count > 0 && <span className="cart-badge">{count}</span>}
        </span>
        <span className="cart-sum">
          <span className="value">{count ? <Price value={yuan(total)} /> : '还没选菜'}</span>
          <BalanceHint count={count} total={total} loggedIn={loggedIn} balance={balance} />
        </span>
      </button>
      <PillButton size="md" disabled={!count || disabled} onClick={checkout}>{checkoutLabel}</PillButton>
    </div>
  </>
}
