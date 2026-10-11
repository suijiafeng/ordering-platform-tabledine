'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, createOrder, payOrder, resolveTable } from '@/lib/api'
import type { CartItem, OrderDetail } from '@/lib/types'
import { getToken } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { itemOptionsText, payNote, yuan } from '@/lib/format'
import { cartCount, cartTotal, useOrdering } from '@/store/ordering'
import { menuPath } from '@/lib/navigation'
import { notify } from '@/store/feedback'
import { confirmDialog } from '@/lib/ui'
import { useMemberBalance } from '@/hooks/useMemberBalance'
import { AppBar, BottomBar, Card, EmptyState, PillButton, Price, Skeleton, Stepper } from '@/components/ui'

// 同一份内容的重复提交（含刷新页面后重试）复用同一个 clientRequestId，服务端据此幂等；
// 购物车、人数、备注任一变化就换新编号，否则改完购物车再提交会拿回服务端上一次创建的旧订单
const REQUEST_ID_KEY = 'ordering_checkout_request_id'
// 未登录时先保存人数和备注，登录回来后恢复
const DRAFT_KEY = 'ordering_checkout_draft'
/** 下单失败后应回菜单重新加载的业务码：售罄 / 库存不足、打烊、规格加料已失效、菜品已下架（状态冲突）、桌码失效 */
const BACK_TO_MENU_CODES = new Set([60001, 60002, 60003, 40901, 40402])

/** crypto.randomUUID 只在 HTTPS / localhost 可用；局域网 http 真机联调时降级为随机字节 */
function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

function requestId(fingerprint: string) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(REQUEST_ID_KEY) ?? 'null') as { id: string; fingerprint: string } | null
    if (stored?.id && stored.fingerprint === fingerprint) return stored.id
  } catch {
    // 旧格式或损坏：重新生成
  }
  const created = newRequestId()
  sessionStorage.setItem(REQUEST_ID_KEY, JSON.stringify({ id: created, fingerprint }))
  return created
}

/** 服务端返回的订单是否就是这次提交的内容（按菜品 + 份数比对）；幂等返回旧订单时能发现不一致 */
function orderMatchesCart(order: OrderDetail, items: CartItem[]) {
  const expected = new Map<string, number>()
  for (const item of items) {
    const key = `${item.dishId}|${[...item.specItemIds].sort().join(',')}|${[...item.addonItemIds].sort().join(',')}`
    expected.set(key, (expected.get(key) ?? 0) + item.quantity)
  }
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
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)  // null：尚未在浏览器端读取登录态
  const { balance, loading: balanceLoading, failed: balanceFailed, refresh: refreshBalance } = useMemberBalance(loggedIn === true)
  const total = cartTotal(items)
  const returnToMenu = menuPath(table?.qrToken)
  // 余额不足时不创建订单：避免生成一笔待支付订单、占用限量库存，再让顾客手动取消
  const insufficient = balance !== null && balance < total

  useEffect(() => {
    setLoggedIn(getToken() != null)
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
    if (!table || !table.storeOpen || !items.length || submitting) return
    if (!getToken()) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ peopleCount, remark }))
      router.push(`/login?redirect=${encodeURIComponent('/checkout')}`)
      return
    }
    if (insufficient) { notify('余额不足，请联系店员充值'); return }
    // 下单即扣款：提交前确认金额，避免误点直接付款（桌号与明细已在本页展示，弹窗只说金额）
    if (!(await confirmDialog(`确认支付 ¥${yuan(total)}？`, payNote(balance, total), '确认支付'))) return
    setSubmitting(true)
    let orderNo = ''
    try {
      const payload = {
        qrToken: table.qrToken,
        peopleCount,
        remark: remark.trim() || undefined,
        items: items.map((item) => ({
          dishId: item.dishId, specItemIds: item.specItemIds, addonItemIds: item.addonItemIds, quantity: item.quantity,
        })),
      }
      const order = await createOrder({ clientRequestId: requestId(JSON.stringify(payload)), ...payload })
      orderNo = order.orderNo
      sessionStorage.removeItem(REQUEST_ID_KEY)
      clear()
      // 拿回的订单必须和这次提交的内容、金额一致，否则先交给顾客在详情页核对，不能直接付款
      if (!orderMatchesCart(order, items)) {
        notify('订单内容与购物车不一致，请核对后支付')
        router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
        return
      }
      if (order.payAmount !== total) {
        notify('菜品价格已更新，请核对后支付')
        router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
        return
      }
      if (await payOrder(orderNo)) { router.replace(`/paid?orderNo=${encodeURIComponent(orderNo)}`); return }
      notify('支付未完成，可在订单中重试')
    } catch (e) {
      // 下单失败：保留 requestId，重试时服务端幂等；支付失败（如余额不足）：订单已创建，去详情页继续处理
      if (!orderNo) setSubmitting(false)
      ignoreShownError(e)
      if (!orderNo && e instanceof ApiError && BACK_TO_MENU_CODES.has(e.code)) {
        // 菜单已变化（售罄、下架、打烊、规格加料失效、桌码失效）：留在结算页重试没有意义，回菜单重新加载并整理购物车
        router.replace(returnToMenu)
        return
      }
    }
    // 成功：保持 submitting，直到详情页替换掉本页（否则先渲染一帧「购物车是空的」）
    if (orderNo) router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
  }

  if (loggedIn === null) return <div className="screen"><AppBar title="确认订单" fallback={returnToMenu} /><Skeleton variant="card" rows={3} label="正在准备结算…" /></div>
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
            <Stepper label="就餐人数" value={peopleCount} min={1} max={50} onChange={setPeopleCount} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="order-remark">口味备注<span className="optional-label">选填</span></label>
            <textarea
              id="order-remark"
              className="textarea"
              value={remark}
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
