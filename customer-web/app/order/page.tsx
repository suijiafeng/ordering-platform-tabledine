'use client'

import { Button, ErrorBlock, SpinLoading, Steps } from 'antd-mobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { applyRefund, cancelOrder, fetchMe, payOrder, withdrawRefund } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import {
  countdownText, dateTime, dateTimeWithSeconds, itemOptionsText, orderStatusDesc, orderStatusText, refundStatusText, statusLogText, yuan,
} from '@/lib/format'
import type { OrderDetail, RefundRecord } from '@/lib/types'
import { useCountdown } from '@/hooks/useCountdown'
import { useOrderPolling } from '@/hooks/useOrderPolling'
import { PageHeader } from '@/components/PageHeader'
import { RefundSheet } from '@/components/RefundSheet'
import { notify } from '@/store/feedback'
import { confirmDialog, copyText } from '@/lib/ui'
import { menuPath } from '@/lib/navigation'
import { useOrdering } from '@/store/ordering'

function StatusCard({ order, onExpire }: { order: OrderDetail; onExpire: () => void }) {
  const secondsLeft = useCountdown(order.status === 'PENDING_PAY' ? order.payExpireAt : null, onExpire)
  return (
    <section className="section-card status-card">
      <div className="order-status status-large">{orderStatusText(order.status)}</div>
      {order.status === 'PENDING_PAY' && (
        <div className="muted">
          {secondsLeft != null && secondsLeft > 0
            ? <>剩余 <span className="countdown">{countdownText(secondsLeft)}</span> 完成支付，超时将自动关闭</>
            : '支付已超时，订单即将关闭'}
        </div>
      )}
      {order.cancelReason
        ? <div className="muted status-desc">{order.cancelReason}</div>
        : orderStatusDesc(order.status) && <div className="muted status-desc">{orderStatusDesc(order.status)}</div>}
    </section>
  )
}

function RefundRecordView({ refund }: { refund: RefundRecord }) {
  return (
    <div className="refund-record">
      <div className="refund-record-head">
        <strong>¥{yuan(refund.amount)}</strong>
        <span className="order-status">{refundStatusText(refund.status)}</span>
      </div>
      {refund.items.length > 0 && (
        <div className="muted">
          退款菜品：{refund.items.map((item) => `${item.dishName}${item.specDesc ? `（${item.specDesc}）` : ''} ×${item.quantity}`).join('、')}
        </div>
      )}
      <div className="muted">申请时间：{dateTime(refund.createdAt)}</div>
      <div className="muted">原因：{refund.reason}</div>
      {refund.rejectReason && <div className="muted">商家回复：{refund.rejectReason}</div>}
      {refund.status === 'FAILED' && refund.failReason && <div className="muted">失败原因：{refund.failReason}，商家会重新处理</div>}
    </div>
  )
}

/** 订单详情：状态与退款进度自动刷新（见 useOrderPolling）；支持余额支付、取消、申请 / 撤回退款 */
function OrderView() {
  const router = useRouter()
  const orderNo = useSearchParams().get('orderNo') || ''
  const { order, loadFailed, fatal, refresh } = useOrderPolling(orderNo)
  const table = useOrdering((state) => state.table)
  const [busy, setBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [actionSeq, setActionSeq] = useState(0)  // 每次操作后 +1，触发余额重新加载
  const pendingPay = order?.status === 'PENDING_PAY'

  // 待支付时显示余额，余额不足的原因一目了然；每次操作（如支付失败）后重新加载
  useEffect(() => {
    if (!pendingPay) return
    let cancelled = false
    fetchMe().then((me) => { if (!cancelled) setBalance(me.balance) }).catch((e: unknown) => { ignoreShownError(e) })
    return () => { cancelled = true }
  }, [pendingPay, actionSeq])

  const runOrderAction = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
      if (success) notify(success, 'success')
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示；下面刷新一次，显示服务端的最新状态
    } finally {
      await refresh()
      setActionSeq((n) => n + 1)
      setBusy(false)
    }
  }

  const pay = async () => {
    if (!order || !(await confirmDialog('确认付款', `将从账户余额支付 ¥${yuan(order.payAmount)}，确认继续？`, '确认支付'))) return
    void runOrderAction(async () => {
      const paid = await payOrder(orderNo)
      notify(paid ? '支付成功' : '支付未完成，请重试', paid ? 'success' : 'info')
    })
  }

  const cancel = async () => {
    const paid = order?.status !== 'PENDING_PAY'
    if (!(await confirmDialog('取消订单', paid ? '取消后款项将退回账户余额，确认取消？' : '确认取消该订单？', '取消订单'))) return
    void runOrderAction(() => cancelOrder(orderNo), '订单已取消')
  }

  if (!order) {
    return <>
      <PageHeader fallback="/orders">订单详情</PageHeader>
      <div className="empty-state">
        {fatal ? <>
          <ErrorBlock status="empty" title={fatal} description="" />
          <Button onClick={() => router.replace('/orders')}>查看全部订单</Button>
        </> : loadFailed ? <>
          <ErrorBlock status="disconnected" title="订单加载失败" description="正在自动重试…" />
          <Button onClick={() => void refresh()}>立即重试</Button>
        </> : <SpinLoading />}
      </div>
    </>
  }

  const activeApplying = order.refunds.find((refund) => refund.status === 'APPLYING')
  const logs = [...order.logs].reverse()

  return (
    <div className="page">
      <PageHeader fallback="/orders">订单详情</PageHeader>
      <div className="content-page">
        {loadFailed && <div className="notice inline">网络不稳定，订单状态可能不是最新</div>}
        <StatusCard order={order} onExpire={() => void refresh()} />

        <section className="section-card">
          <h2 className="section-title">{order.storeName} · 桌号 {order.tableCode}</h2>
          {order.items.map((item) => (
            <div className="row" key={item.id}>
              <div className="row-main">
                <strong>{item.dishName}</strong>
                <div className="muted">{itemOptionsText(item)}</div>
                {item.refundedQty > 0 && <div className="muted">已退 {item.refundedQty} 份</div>}
              </div>
              <span>x{item.quantity}</span>
              <strong>¥{yuan(item.totalPrice)}</strong>
            </div>
          ))}
          <div className="row">
            <span>实付</span>
            <strong className="price">¥{yuan(order.payAmount)}</strong>
          </div>
          {order.refundedAmount > 0 && <div className="refunded">已退款 ¥{yuan(order.refundedAmount)}</div>}
        </section>

        <section className="section-card">
          <div className="row">
            <span>订单号</span>
            <span className="muted selectable">
              {order.orderNo}
              <button className="copy-link" onClick={async () => notify((await copyText(order.orderNo)) ? '订单号已复制' : '复制失败，请长按选择')}>复制</button>
            </span>
          </div>
          <div className="row"><span>下单时间</span><span>{dateTime(order.createdAt)}</span></div>
          {order.paidAt && <div className="row"><span>支付时间</span><span>{dateTime(order.paidAt)}</span></div>}
          <div className="row"><span>就餐人数</span><span>{order.peopleCount}</span></div>
          {order.remark && <div className="row"><span>备注</span><span className="row-value">{order.remark}</span></div>}
        </section>

        {order.refunds.length > 0 && (
          <section className="section-card">
            <h2 className="section-title">退款记录</h2>
            {order.refunds.map((refund) => <RefundRecordView key={refund.refundNo} refund={refund} />)}
          </section>
        )}

        {order.canApplyRefund && (
          <section className="section-card after-sale-card">
            <div>
              <h2 className="section-title">售后服务</h2>
              <div className="muted">如菜品存在问题，建议先联系店员协助处理。</div>
            </div>
            <button className="refund-entry" disabled={busy} onClick={() => setRefundOpen(true)}>申请退款 ›</button>
          </section>
        )}

        {logs.length > 0 && (
          <section className="section-card">
            <h2 className="section-title">订单进度</h2>
            <Steps direction="vertical" current={0}>
              {logs.map((log, index) => (
                <Steps.Step
                  key={`${log.toStatus}-${log.createdAt}-${index}`}
                  title={statusLogText(log.toStatus, log.operatorType)}
                  description={`${log.remark && log.operatorType !== 'CUSTOMER' ? `${log.remark} · ` : ''}${dateTimeWithSeconds(log.createdAt)}`}
                />
              ))}
            </Steps>
          </section>
        )}

        <section className="order-actions">
          {order.status === 'PENDING_PAY' && <>
            <Button block color="primary" size="large" loading={busy} onClick={pay}>余额支付 ¥{yuan(order.payAmount)}</Button>
            {balance !== null && (
              <div className={`pay-balance ${balance < order.payAmount ? 'warning' : 'muted'}`}>
                账户余额 ¥{yuan(balance)}{balance < order.payAmount ? `，还差 ¥${yuan(order.payAmount - balance)}，请联系店员充值后再支付` : ''}
              </div>
            )}
          </>}
          <div className="order-actions-row">
            {order.canCancel && <Button disabled={busy} onClick={cancel}>取消订单</Button>}
            {activeApplying && (
              <Button disabled={busy} onClick={() => runOrderAction(() => withdrawRefund(activeApplying.refundNo), '退款申请已撤回')}>
                撤回退款申请
              </Button>
            )}
            <Button onClick={() => router.push(menuPath(table?.qrToken))}>继续点餐</Button>
          </div>
        </section>
        <RefundSheet
          visible={refundOpen}
          items={order.items}
          refundableAmount={order.refundableAmount}
          busy={busy}
          onClose={() => setRefundOpen(false)}
          onSubmit={(reason, items) => {
            setRefundOpen(false)
            void runOrderAction(() => applyRefund(orderNo, reason, items), '已提交，等待商家审核')
          }}
        />
      </div>
    </div>
  )
}

export default function OrderPage() {
  return <Suspense><OrderView /></Suspense>
}
