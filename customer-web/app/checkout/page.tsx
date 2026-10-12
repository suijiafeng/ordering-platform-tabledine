'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ApiError, createOrder, fetchMe, payOrder, resolveTable } from '@/lib/api'
import type { CartItem, OrderDetail } from '@/lib/types'
import { getToken } from '@/lib/auth'
import { beginCheckout, checkoutMatchesCart, checkoutPayload, CheckoutStorageError, finishCheckout, readPendingCheckout, type PendingCheckout } from '@/lib/checkout-request'
import { CheckoutRecovery } from '@/components/CheckoutRecovery'
import { ignoreShownError } from '@/lib/errors'
import { itemOptionsText, payNote, yuan } from '@/lib/format'
import { cartCount, cartTotal, useOrdering } from '@/store/ordering'
import { menuPath } from '@/lib/navigation'
import { notify } from '@/store/feedback'
import { confirmDialog } from '@/lib/ui'
import { useMemberBalance } from '@/hooks/useMemberBalance'
import { AppBar, BottomBar, Card, EmptyState, PillButton, Price, Skeleton, Stepper } from '@/components/ui'

// 未登录时先保存人数和备注，登录回来后恢复
const DRAFT_KEY = 'ordering_checkout_draft'
/** 下单失败后应回菜单重新加载的业务码 */
const BACK_TO_MENU_CODES = new Set([60001, 60002, 60003, 40901, 40402])

/** 服务端返回的订单是否就是这次提交的内容（按菜品 + 份数比对）；幂等返回旧订单时能发现不一致 */
function orderMatchesCart(order: OrderDetail, items: CartItem[]) {
  const byDish = (list: { dishId: number; quantity: number }[]) => {
    const m = new Map<number, number>()
    for (const i of list) m.set(i.dishId, (m.get(i.dishId) ?? 0) + i.quantity)
    return m
  }
  const a = byDish(items)
  const b = byDish(order.items)
  if (a.size !== b.size || order.items.length !== items.length) return false
  for (const [dishId, qty] of a) if (b.get(dishId) !== qty) return false
  return true
}

/**
 * 确认订单：明细、就餐人数、备注。提交时才要求登录会员账号；
 * 下单（服务端重算价格）→ 余额支付（发起即扣费入账）→ 支付成功页。
 */
export default function CheckoutPage() {
  const router = useRouter()
  const { table, items, setTable, clear } = useOrdering()
  const [peopleCount, setPeopleCount] = useState(1)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)
  const [pending, setPending] = useState<PendingCheckout | null>(null)
  const [storageFailed, setStorageFailed] = useState(false)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)  // null：尚未在浏览器端读取登录态
  const { balance, loading: balanceLoading, failed: balanceFailed, refresh: refreshBalance } = useMemberBalance(loggedIn === true)
  const total = cartTotal(items)
  const returnToMenu = menuPath(table?.qrToken)
  // 余额不足时不创建订单：避免生成一笔待支付订单、占用限量库存，再让顾客手动取消
  const insufficient = balance !== null && balance < total

  useEffect(() => {
    setLoggedIn(getToken() != null)
    try { setPending(readPendingCheckout(sessionStorage)) } catch { setStorageFailed(true) }
    const draft = sessionStorage.getItem(DRAFT_KEY)
    if (draft) {
      sessionStorage.removeItem(DRAFT_KEY)
      try {
        const value = JSON.parse(draft) as { peopleCount?: number; remark?: string }
        setPeopleCount(value.peopleCount || 1)
        setRemark(value.remark || '')
      } catch {
        // 草稿损坏：忽略，顾客重新填写即可
      }
    }
  }, [])

  // 进入确认页时刷新营业状态：在菜单页停留期间可能已经打烊
  useEffect(() => {
    const current = useOrdering.getState().table
    if (!current) return
    resolveTable(current.qrToken).then(setTable).catch((e: unknown) => {
      ignoreShownError(e)  // 桌码失效等：下单时服务端会给出明确提示
    })
  }, [setTable])

  const submit = async () => {
    if (!table || !table.storeOpen || !items.length || submitLock.current) return
    if (!getToken()) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ peopleCount, remark }))
      router.push(`/login?redirect=${encodeURIComponent('/checkout')}`)
      return
    }
    // 同步锁从确认框之前开始，重复点击不会打开第二个下单流程。
    submitLock.current = true
    let attempt: PendingCheckout | null = null
    let orderNo = ''
    try {
      const unresolved = readPendingCheckout(sessionStorage)
      if (unresolved) { setPending(unresolved); return }
      if (insufficient) { notify('余额不足，请联系店员充值'); return }
      if (!(await confirmDialog(`确认支付 ¥${yuan(total)}？`, payNote(balance, total), '确认支付'))) return
      setSubmitting(true)
      const profile = await fetchMe()
      if (profile.balance < total) { notify('余额不足，请联系店员充值'); return }
      const payload = checkoutPayload(table.qrToken, peopleCount, remark, items)
      attempt = beginCheckout(sessionStorage, payload, profile.id, items, table.tableCode)
      setPending(attempt)
      const order = await createOrder(attempt.payload!)
      orderNo = order.orderNo
      const current = useOrdering.getState()
      const cartUnchanged = checkoutMatchesCart(attempt, current.table?.qrToken, current.items)
      if (cartUnchanged) clear()
      // 改过购物车、恢复原请求、菜价变化都交给详情页确认，不沿用旧的支付意图。
      if (!cartUnchanged || !orderMatchesCart(order, items)) {
        notify('订单内容与当前购物车不同，请核对原订单后支付')
        router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
        return
      }
      if (order.payAmount !== total) {
        notify('菜品价格已更新，请核对后支付')
        router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
        return
      }
      if (await payOrder(orderNo)) {
        finishCheckout(sessionStorage, attempt.id)
        router.replace(`/paid?orderNo=${encodeURIComponent(orderNo)}`)
        return
      }
      notify('支付未完成，可在订单中重试')
    } catch (e) {
      // 仅首次请求明确被业务校验拒绝时可释放编号；网络/5xx/解析失败均保留原请求。
      if (!orderNo && attempt && e instanceof ApiError && e.code > 0 && e.status >= 400 && e.status < 500) {
        finishCheckout(sessionStorage, attempt.id)
        setPending(null)
      }
      if (e instanceof CheckoutStorageError) {
        setStorageFailed(true)
        notify('无法保存或读取下单记录，请先在我的订单中核对，避免重复下单')
      } else {
        ignoreShownError(e)
        if (!orderNo && e instanceof ApiError && BACK_TO_MENU_CODES.has(e.code)) router.replace(returnToMenu)
      }
    } finally {
      submitLock.current = false
      if (!orderNo) setSubmitting(false)
    }
    if (orderNo) router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
  }

  if (loggedIn === null) return <div className="screen"><AppBar title="确认订单" fallback={returnToMenu} /><Skeleton variant="card" rows={3} label="正在准备结算…" /></div>
  if (storageFailed) return <div className="screen"><AppBar title="确认订单" fallback={returnToMenu} /><EmptyState title="无法读取下单记录" desc="为避免重复下单，请先在我的订单中核对原订单，或联系店员协助。" action={<PillButton onClick={() => router.push('/orders')}>查看我的订单</PillButton>} /></div>
  if (pending && !submitting) return <CheckoutRecovery pending={pending} loggedIn={loggedIn} returnToMenu={returnToMenu} onResolved={() => setPending(null)} />
  if (submitting && !items.length) return <div className="center-state full" role="status"><span className="spinner" /><div className="t-title">正在确认支付结果</div><div className="t-note">请稍候，可在「我的订单」查看进度</div></div>
  if (!table || !items.length) {
    return (
      <div className="screen">
        <AppBar title="确认订单" fallback={returnToMenu} />
        <EmptyState title="购物车还是空的" desc="快去挑选喜欢的菜品吧" action={<PillButton onClick={() => router.replace(returnToMenu)}>去点餐</PillButton>} />
      </div>
    )
  }

  const actionText = !table.storeOpen ? '已打烊' : !loggedIn ? '登录后确认' : insufficient ? '刷新余额' : '确认并支付'
  return (
    <div className="screen has-bar">
      <AppBar title="确认订单" fallback={returnToMenu} />
      <div className="body-pad">
        <Card className="table-card">
          <div>
            <div className="label">用餐桌号</div>
            <div className="value">{table.tableCode}桌</div>
          </div>
          <div className="checkout-store"><strong>{table.storeName}</strong><span>堂食 · 请确认桌号后再支付</span></div>
        </Card>

        <Card className="checkout-payment">
          <div className="section-heading">
            <h2 className="card-title">余额支付</h2>
            {loggedIn && <button className="text-action" disabled={balanceLoading} onClick={() => void refreshBalance()}>{balanceLoading ? '刷新中…' : '刷新余额'}</button>}
          </div>
          <div role="status" aria-live="polite">
            {!loggedIn ? <>
              <p className="payment-lead">选好的菜品已保留，登录后再确认支付</p>
              <p className="payment-note">本店使用会员余额。首次用餐或忘记密码，请联系店员协助。</p>
            </> : balanceLoading ? <p className="payment-note">正在查询余额…</p>
              : balanceFailed ? <p className="payment-note">暂时无法查询余额，请刷新重试。支付结果以实际余额为准。</p>
                : balance !== null && <>
                  <div className="balance-amount"><span>当前可用</span><Price value={yuan(balance)} /></div>
                  {insufficient
                    ? <p className="balance-warning">还差 ¥{yuan(total - balance)}，请联系店员充值后刷新余额。</p>
                    : <p className="payment-note">本次支付 ¥{yuan(total)}，预计剩余 ¥{yuan(balance - total)}</p>}
                </>}
          </div>
        </Card>

        <Card>
          <div className="section-heading"><h2 className="card-title">已选菜品 · {cartCount(items)} 件</h2><button className="text-action" onClick={() => router.push(returnToMenu)}>返回修改</button></div>
          {items.map((item) => (
            <div className="li" key={item.key}>
              <span className="li-name">
                {item.name}
                {itemOptionsText(item) && <span className="li-sub">{itemOptionsText(item)}</span>}
              </span>
              <span className="li-qty">x{item.quantity}</span>
              <span className="li-amt">¥{yuan(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
        </Card>

        <Card>
          <div className="field-row">
            <span className="t-value">就餐人数</span>
            <Stepper label="就餐人数" value={peopleCount} min={1} max={50} onChange={value => { if (!submitting) setPeopleCount(value) }} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="order-remark">口味备注<span className="optional-label">选填</span></label>
            <textarea
              id="order-remark"
              className="textarea"
              value={remark}
              disabled={submitting}
              maxLength={100}
              rows={2}
              placeholder="口味偏好，如：少盐、不放葱"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <div className="kv"><span>菜品小计</span><span>¥{yuan(total)}</span></div>
          <div className="kv strong"><span>应付</span><span>¥{yuan(total)}</span></div>
        </Card>
        <p className="checkout-footnote">
          确认后将从会员余额支付。如菜品价格有变化，会请你重新核对。退款会退回到余额。
        </p>
      </div>

      <BottomBar>
        <div className="bar-total grow">
          <span className="label">应付</span>
          <span className="value"><Price value={yuan(total)} /></span>
        </div>
        <PillButton loading={submitting || (insufficient && balanceLoading)} loadingLabel={submitting ? '正在提交…' : '刷新中…'} disabled={!table.storeOpen} onClick={insufficient && loggedIn ? refreshBalance : submit}>{actionText}</PillButton>
      </BottomBar>
    </div>
  )
}
