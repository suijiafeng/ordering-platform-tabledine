'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrder, fetchMe, fetchOrderByRequest } from '@/lib/api'
import { checkoutMatchesCart, finishCheckout, type PendingCheckout } from '@/lib/checkout-request'
import { ignoreShownError } from '@/lib/errors'
import { itemOptionsText, orderStatusText, yuan } from '@/lib/format'
import type { OrderDetail } from '@/lib/types'
import { confirmDialog } from '@/lib/ui'
import { notify } from '@/store/feedback'
import { useOrdering } from '@/store/ordering'
import { AppBar, Card, PillButton } from '@/components/ui'

/** 原请求未明确结束前，不允许用修改后的购物车生成新编号，也不自动付款或取消。 */
export function CheckoutRecovery({ pending, loggedIn, returnToMenu, onResolved }: {
  pending: PendingCheckout; loggedIn: boolean; returnToMenu: string; onResolved: () => void
}) {
  const router = useRouter()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('正在查询上次下单结果…')
  const inFlight = useRef(false)

  const lookup = useCallback(async () => {
    if (!loggedIn || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const found = await fetchOrderByRequest(pending.id)
      setOrder(found)
      setMessage(found ? '已找到原订单，请先核对并处理。' : '暂未查到原订单，原请求可能仍在处理中。请继续查询，或确认原内容后重试。')
    } catch (e) {
      setMessage('暂时无法查询原订单，请检查网络后重试。当前购物车已保留。')
      ignoreShownError(e)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [loggedIn, pending.id])

  useEffect(() => { void lookup() }, [lookup])

  const retryOriginal = async () => {
    if (inFlight.current || !pending.payload || !pending.customerId) return
    inFlight.current = true
    setBusy(true)
    try {
      const profile = await fetchMe()
      if (profile.id !== pending.customerId) { notify('请使用上次下单的会员账号查询或重试'); return }
      // 重试只使用已保存的原始内容。确认文案明确不会使用新购物车，也不会扣款。
      if (!(await confirmDialog('按原内容重试下单？', `原订单：${pending.tableCode || ''}桌，¥${yuan(pending.total || 0)}。将按下方原菜品、人数和备注重试，当前购物车保留；重试不会自动支付，最新价格请在订单页核对。`, '重试原订单'))) return
      const found = await fetchOrderByRequest(pending.id)
      setOrder(found ?? await createOrder(pending.payload))
      setMessage('已找到原订单，请先核对并处理。')
    } catch (e) {
      // 即使重试被拒，也不能推断第一次请求已失败；保留原编号继续查询。
      setMessage('原订单结果仍未确认，请稍后继续查询。')
      ignoreShownError(e)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const acknowledgeResolved = () => {
    if (!order || order.status === 'PENDING_PAY') return
    finishCheckout(sessionStorage, pending.id)
    if (order.status !== 'CLOSED' && order.status !== 'CANCELLED') {
      const current = useOrdering.getState()
      if (checkoutMatchesCart(pending, current.table?.qrToken, current.items)) current.clear()
    }
    onResolved()
  }

  return (
    <div className="screen">
      <AppBar title="确认上次下单结果" fallback={returnToMenu} />
      <div className="body-pad">
        <Card>
          <h2 className="card-title">{order ? `原订单：${orderStatusText(order.status, order.cookingStartedAt)}` : '上次下单结果待确认'}</h2>
          <p className="payment-note" role="status">{loggedIn ? message : '请先登录原会员账号，查询上次下单结果。'}</p>
          <p className="payment-note">当前购物车已保留。原订单待支付时，请先在订单页支付或明确取消，再提交新的内容。</p>
          {order ? <>
            <p>{order.storeName} · {order.tableCode}桌 · ¥{yuan(order.payAmount)}</p>
            {order.items.map(item => <div className="li" key={item.id}><span className="li-name">{item.dishName}<span className="li-sub">{itemOptionsText(item)}</span></span><span>×{item.quantity}</span></div>)}
            <p className="payment-note">{order.peopleCount} 人{order.remark ? ` · ${order.remark}` : ''}</p>
            <PillButton block onClick={() => router.push(`/order?orderNo=${encodeURIComponent(order.orderNo)}`)}>查看原订单</PillButton>
            {order.status !== 'PENDING_PAY' && <PillButton block variant="outline" onClick={acknowledgeResolved}>已确认，继续当前购物车</PillButton>}
          </> : pending.items && <>
            <p>原内容 · {pending.tableCode}桌 · ¥{yuan(pending.total || 0)}</p>
            {pending.items.map(item => <div className="li" key={item.key}><span className="li-name">{item.name}<span className="li-sub">{itemOptionsText(item)}</span></span><span>×{item.quantity}</span></div>)}
            <p className="payment-note">{pending.payload?.peopleCount} 人{pending.payload?.remark ? ` · ${pending.payload.remark}` : ''}</p>
          </>}
          {loggedIn ? <>
            <PillButton block variant="outline" loading={busy} loadingLabel="正在确认…" onClick={() => void lookup()}>查询原订单</PillButton>
            {!order && pending.payload && pending.customerId && <PillButton block variant="plain" disabled={busy} onClick={() => void retryOriginal()}>按原内容重试</PillButton>}
          </> : <PillButton block onClick={() => router.push(`/login?redirect=${encodeURIComponent('/checkout')}`)}>登录并查询原订单</PillButton>}
        </Card>
        <PillButton block variant="plain" onClick={() => router.push(returnToMenu)}>返回修改购物车</PillButton>
      </div>
    </div>
  )
}
