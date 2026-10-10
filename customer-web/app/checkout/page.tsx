'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, createOrder, fetchMe, payOrder, resolveTable } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { itemOptionsText, yuan } from '@/lib/format'
import { cartCount, cartTotal, useOrdering } from '@/store/ordering'
import { menuPath } from '@/lib/navigation'
import { notify } from '@/store/feedback'
import { AppBar, BottomBar, Card, EmptyState, PillButton, Stepper } from '@/components/ui'

// 同一次提交（含刷新页面后重试）复用同一个 clientRequestId，服务端据此幂等；下单成功后才换新的
const REQUEST_ID_KEY = 'ordering_checkout_request_id'
// 未登录时先保存人数和备注，登录回来后恢复
const DRAFT_KEY = 'ordering_checkout_draft'
/** 下单失败后应回菜单重新加载的业务码：售罄 / 库存不足、打烊、菜品已下架（状态冲突）、桌码失效 */
const BACK_TO_MENU_CODES = new Set([60001, 60002, 40901, 40402])

/** crypto.randomUUID 只在 HTTPS / localhost 可用；局域网 http 真机联调时降级为随机字节 */
function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

function requestId() {
  const existing = sessionStorage.getItem(REQUEST_ID_KEY)
  if (existing) return existing
  const created = newRequestId()
  sessionStorage.setItem(REQUEST_ID_KEY, created)
  return created
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
  const [balance, setBalance] = useState<number | null>(null)     // null：未登录或尚未加载
  const total = cartTotal(items)
  const returnToMenu = menuPath(table?.qrToken)
  // 余额不足时不创建订单：避免生成一笔待支付订单、占用限量库存，再让顾客手动取消
  const insufficient = balance !== null && balance < total

  const loadBalance = useCallback(async () => {
    if (!getToken()) return
    try {
      setBalance((await fetchMe()).balance)
    } catch (e) {
      ignoreShownError(e)  // 加载失败不拦截下单，由服务端兜底校验余额
    }
  }, [])

  useEffect(() => {
    setLoggedIn(getToken() != null)
    void loadBalance()
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
  }, [loadBalance])

  // 进入确认页时刷新营业状态：在菜单页停留期间可能已经打烊
  useEffect(() => {
    const current = useOrdering.getState().table
    if (!current) return
    resolveTable(current.qrToken).then(setTable).catch((e: unknown) => {
      ignoreShownError(e)  // 桌码失效等：下单时服务端会给出明确提示
    })
  }, [setTable])

  const submit = async () => {
    if (!table || !items.length || submitting) return
    if (!getToken()) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ peopleCount, remark }))
      router.push(`/login?redirect=${encodeURIComponent('/checkout')}`)
      return
    }
    if (insufficient) { notify('余额不足，请联系店员充值'); return }
    setSubmitting(true)
    let orderNo = ''
    try {
      const order = await createOrder({
        clientRequestId: requestId(),
        qrToken: table.qrToken,
        peopleCount,
        remark: remark.trim() || undefined,
        items: items.map((item) => ({
          dishId: item.dishId, specItemIds: item.specItemIds, addonItemIds: item.addonItemIds, quantity: item.quantity,
        })),
      })
      orderNo = order.orderNo
      sessionStorage.removeItem(REQUEST_ID_KEY)
      clear()
      if (await payOrder(orderNo)) { router.replace(`/paid?orderNo=${encodeURIComponent(orderNo)}`); return }
      notify('支付未完成，可在订单中重试')
    } catch (e) {
      // 下单失败：保留 requestId，重试时服务端幂等；支付失败（如余额不足）：订单已创建，去详情页继续处理
      if (!orderNo) setSubmitting(false)
      ignoreShownError(e)
      if (!orderNo && e instanceof ApiError && BACK_TO_MENU_CODES.has(e.code)) {
        // 菜单已变化（售罄、下架、打烊、桌码失效）：留在结算页重试没有意义，回菜单重新加载并整理购物车
        router.replace(returnToMenu)
        return
      }
    }
    // 成功：保持 submitting，直到详情页替换掉本页（否则先渲染一帧「购物车是空的」）
    if (orderNo) router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
  }

  if (loggedIn === null) return null
  if (submitting && !items.length) return <div className="center-state full"><span className="spinner" /><div className="t-note">正在支付…</div></div>
  if (!table || !items.length) {
    return (
      <div className="screen">
        <AppBar title="确认订单" fallback={returnToMenu} />
        <EmptyState title="购物车还是空的" desc="快去挑选喜欢的菜品吧" action={<PillButton onClick={() => router.replace(returnToMenu)}>去点餐</PillButton>} />
      </div>
    )
  }

  const actionText = !table.storeOpen ? '已打烊' : !loggedIn ? '登录并支付' : insufficient ? '余额不足' : '提交订单'
  return (
    <div className="screen has-bar">
      <AppBar title="确认订单" fallback={returnToMenu} />
      <div className="body-pad">
        <Card className="table-card">
          <div>
            <div className="label">用餐桌号</div>
            <div className="value">{table.tableCode}桌</div>
          </div>
          <div className="t-note">{table.storeName}</div>
        </Card>

        <Card>
          <h2 className="card-title">菜品清单（{cartCount(items)} 件）</h2>
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
            <Stepper value={peopleCount} min={1} max={50} onChange={setPeopleCount} />
          </div>
          <div className="field-block">
            <div className="label">备注</div>
            <textarea
              className="textarea"
              value={remark}
              maxLength={100}
              rows={2}
              placeholder="口味偏好，如：少盐、不放葱"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </Card>

        {balance !== null && (
          <Card className="balance-card">
            <span className="t-label">余额</span>
            <span className="t-value">
              ¥{yuan(balance)}
              <button className="mini-btn" style={{ marginLeft: 8 }} onClick={() => void loadBalance()}>刷新</button>
            </span>
            {insufficient && <div className="warn-line">余额不够支付本单（差 ¥{yuan(total - balance)}），请联系店员充值后刷新余额。</div>}
          </Card>
        )}

        <Card>
          <div className="kv"><span>菜品小计</span><span>¥{yuan(total)}</span></div>
          <div className="kv strong"><span>应付</span><span>¥{yuan(total)}</span></div>
        </Card>
        <p className="t-faint" style={{ margin: '4px 4px 0', lineHeight: 1.6 }}>
          最终金额以提交后的结算结果为准；支付时从余额抵扣，取消或退款会退回到余额。
        </p>
      </div>

      <BottomBar>
        <div className="bar-total grow">
          <span className="label">应付</span>
          <span className="value">¥{yuan(total)}</span>
        </div>
        <PillButton loading={submitting} disabled={!table.storeOpen || insufficient} onClick={submit}>{actionText}</PillButton>
      </BottomBar>
    </div>
  )
}
