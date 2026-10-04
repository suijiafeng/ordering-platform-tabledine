'use client'

import { Button, Form, Stepper, TextArea } from 'antd-mobile'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createOrder, payOrder, resolveTable } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { itemOptionsText, yuan } from '@/lib/format'
import { cartCount, cartTotal, useOrdering } from '@/store/ordering'
import { PageHeader } from '@/components/PageHeader'
import { menuPath } from '@/lib/navigation'
import { notify } from '@/store/feedback'

// 同一次提交（含刷新页面后重试）复用同一个 clientRequestId，服务端据此幂等；下单成功后才换新的
const REQUEST_ID_KEY = 'ordering_checkout_request_id'
// 未登录时先保存人数和备注，登录回来后恢复
const DRAFT_KEY = 'ordering_checkout_draft'

function requestId() {
  const existing = sessionStorage.getItem(REQUEST_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(REQUEST_ID_KEY, created)
  return created
}

/**
 * 确认订单：明细、就餐人数、备注。提交时才要求登录会员账号；
 * 下单（服务端重算价格）→ 余额支付（发起即扣费入账）→ 订单详情。
 */
export default function CheckoutPage() {
  const router = useRouter()
  const { table, items, setTable, clear } = useOrdering()
  const [peopleCount, setPeopleCount] = useState(1)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)  // null：尚未在浏览器端读取登录态
  const total = cartTotal(items)
  const returnToMenu = menuPath(table?.qrToken)

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
    if (!table || !items.length || submitting) return
    if (!getToken()) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ peopleCount, remark }))
      router.push(`/login?redirect=${encodeURIComponent('/checkout')}`)
      return
    }
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
      const paid = await payOrder(orderNo)
      notify(paid ? '支付成功' : '支付未完成，可在订单中重试', paid ? 'success' : 'info')
    } catch (e) {
      // 下单失败：保留 requestId，重试时服务端幂等；支付失败（如余额不足）：订单已创建，去详情页继续处理
      ignoreShownError(e)
    } finally {
      setSubmitting(false)
      if (orderNo) router.replace(`/order?orderNo=${encodeURIComponent(orderNo)}`)
    }
  }

  if (loggedIn === null) return null
  if (submitting && !items.length) return <div className="empty-state">正在支付…</div>
  if (!table || !items.length) {
    return <>
      <PageHeader fallback={returnToMenu}>确认订单</PageHeader>
      <div className="empty-state">
        <h1>购物车是空的</h1>
        <Button color="primary" onClick={() => router.replace(returnToMenu)}>返回点餐</Button>
      </div>
    </>
  }

  const actionText = !table.storeOpen ? '已打烊' : loggedIn ? '余额支付' : '登录并支付'
  return (
    <div className="page">
      <PageHeader fallback={returnToMenu}>确认订单</PageHeader>
      <div className="content-page">
        <section className="section-card">
          <div className="section-title">{table.storeName}</div>
          <span className="table-pill">桌号 {table.tableCode}</span>
        </section>

        <section className="section-card">
          <h2 className="section-title">订单明细</h2>
          {items.map((item) => (
            <div className="row" key={item.key}>
              <div className="row-main">
                <strong>{item.name}</strong>
                <div className="muted">{itemOptionsText(item)}</div>
              </div>
              <span>x{item.quantity}</span>
              <strong>¥{yuan(item.unitPrice * item.quantity)}</strong>
            </div>
          ))}
          <div className="row">
            <span>共 {cartCount(items)} 件</span>
            <strong className="price">合计 ¥{yuan(total)}</strong>
          </div>
        </section>

        <section className="section-card">
          <Form layout="horizontal">
            <Form.Item label="就餐人数">
              <Stepper min={1} max={50} value={peopleCount} onChange={setPeopleCount} />
            </Form.Item>
            <Form.Item label="备注">
              <TextArea value={remark} onChange={setRemark} maxLength={100} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="口味、忌口等（选填）" />
            </Form.Item>
          </Form>
        </section>
        <p className="hint">实际金额以服务端计算为准；提交后从账户余额扣款，取消或退款原路退回余额。</p>
      </div>
      <div className="sticky-action">
        <strong className="amount-large">¥{yuan(total)}</strong>
        <Button color="primary" size="large" shape='rounded' loading={submitting} disabled={!table.storeOpen} onClick={submit}>{actionText}</Button>
      </div>
    </div>
  )
}
