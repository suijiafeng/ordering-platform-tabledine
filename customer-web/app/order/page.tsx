'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { applyRefund, cancelOrder, payOrder, withdrawRefund } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import {
  countdownText, dateTime, dateTimeWithSeconds, itemOptionsText, orderStatusDesc, orderStatusText, refundStatusText, statusLogText, yuan,
} from '@/lib/format'
import type { OrderDetail, OrderStatus, RefundRecord } from '@/lib/types'
import { useMemberBalance } from '@/hooks/useMemberBalance'
import { useCountdown } from '@/hooks/useCountdown'
import { useOrderPolling } from '@/hooks/useOrderPolling'
import { RefundSheet } from '@/components/RefundSheet'
import { notify } from '@/store/feedback'
import { alertDialog, confirmDialog, copyText } from '@/lib/ui'
import { menuPath } from '@/lib/navigation'
import { useOrdering } from '@/store/ordering'
import { AppBar, BottomBar, Card, EmptyState, PillButton, Skeleton } from '@/components/ui'

/** 已支付、制作中、已出餐：支付完成后立即点亮第一步，避免看起来仍未提交。 */
const STEPS = [
  { label: '已支付', from: ['PAID', 'MAKING', 'READY'] },
  { label: '制作中', from: ['MAKING', 'READY'] },
  { label: '已出餐', from: ['READY'] },
] as const
const IN_PROGRESS: OrderStatus[] = ['PAID', 'MAKING', 'READY']

function StatusCard({ order }: { order: OrderDetail }) {
  const now = order.status === 'MAKING' ? 1 : order.status === 'READY' ? 2 : 0
  return (
    <div className="status-card">
      <div className="title">{orderStatusText(order.status)}</div>
      <div className="desc">{order.cancelReason || orderStatusDesc(order.status)}</div>
      {IN_PROGRESS.includes(order.status) && (
        <div className="steps">
          {STEPS.map((step, index) => (
            <div key={step.label} aria-current={index === now ? 'step' : undefined} className={`step ${(step.from as readonly string[]).includes(order.status) ? 'done' : ''} ${index === now ? 'now' : ''}`.trim()}>
              <span className="pt" />
              {step.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 待支付：收银台样式的金额卡（含倒计时） */
function Cashier({ order, onExpire }: { order: OrderDetail; onExpire: () => void }) {
  const secondsLeft = useCountdown(order.payExpireAt, onExpire)
  return (
    <Card className="cashier">
      <span className="label">支付金额</span>
      <div className="amount">¥{yuan(order.payAmount)}</div>
      <div className="meta">
        {order.storeName} · {order.tableCode}桌
        <span className="no">订单号 {order.orderNo}</span>
        <span className="left">{secondsLeft != null && secondsLeft > 0 ? `剩余 ${countdownText(secondsLeft)} 完成支付` : '支付已超时，订单即将关闭'}</span>
      </div>
    </Card>
  )
}

function RefundRecordView({ refund }: { refund: RefundRecord }) {
  return (
    <div className="refund-rec">
      <div className="head">
        <span>¥{yuan(refund.amount)}</span>
        <span style={{ color: 'var(--brand)' }}>{refundStatusText(refund.status)}</span>
      </div>
      {refund.items.length > 0 && (
        <div className="t-cap">退款菜品：{refund.items.map((item) => `${item.dishName}${item.specDesc ? `（${item.specDesc}）` : ''} ×${item.quantity}`).join('、')}</div>
      )}
      <div className="t-cap">申请时间：{dateTime(refund.createdAt)}</div>
      <div className="t-cap">原因：{refund.reason}</div>
      {refund.rejectReason && <div className="t-cap">商家回复：{refund.rejectReason}</div>}
      {refund.status === 'FAILED' && refund.failReason && <div className="t-cap">失败原因：{refund.failReason}，商家会重新处理</div>}
    </div>
  )
}

/** 订单详情：状态与退款进度自动刷新（见 useOrderPolling）；待支付时按收银台布局展示 */
function OrderView() {
  const router = useRouter()
  const orderNo = useSearchParams().get('orderNo') || ''
  const { order, loadFailed, fatal, refresh } = useOrderPolling(orderNo)
  const table = useOrdering((state) => state.table)
  const [busy, setBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const pendingPay = order?.status === 'PENDING_PAY'
  const { balance, loading: balanceLoading, failed: balanceFailed, refresh: refreshBalance } = useMemberBalance(pendingPay)
  const insufficient = balance !== null && !!order && balance < order.payAmount

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
      void refreshBalance()
      setBusy(false)
    }
  }

  const pay = async () => {
    if (busy || !order || insufficient || !(await confirmDialog('确认支付？', `将从余额中支付 ¥${yuan(order.payAmount)}`, '确认支付'))) return
    void runOrderAction(async () => {
      if (await payOrder(orderNo)) { router.replace(`/paid?orderNo=${encodeURIComponent(orderNo)}`); return }
      if (await confirmDialog('支付失败', '支付未成功，请检查网络后重试', '重新支付', '稍后再说')) void pay()
    })
  }

  const cancel = async () => {
    const paid = order?.status !== 'PENDING_PAY'
    if (!(await confirmDialog('确定取消订单吗？', paid ? '取消后金额会退回到余额' : '取消后需重新下单', '确定取消'))) return
    void runOrderAction(() => cancelOrder(orderNo), '订单已取消')
  }

  if (!order) {
    return (
      <div className="screen">
        <AppBar title="订单详情" fallback="/orders" />
        {fatal
          ? <EmptyState title={fatal} desc="可以回到列表看看其他订单" action={<PillButton onClick={() => router.replace('/orders')}>查看全部订单</PillButton>} />
          : loadFailed
            ? <EmptyState icon="!" title="订单加载失败" desc="正在自动重试…" action={<PillButton onClick={() => void refresh()}>立即重试</PillButton>} />
            : <Skeleton rows={3} variant="card" label="订单加载中…" />}
      </div>
    )
  }

  const activeApplying = order.refunds.find((refund) => refund.status === 'APPLYING')
  const logs = [...order.logs].reverse()
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const secondary = order.canCancel
    ? <PillButton className="grow" variant="outline" disabled={busy} onClick={cancel}>取消订单</PillButton>
    : activeApplying
      ? <PillButton className="grow" variant="outline" disabled={busy} onClick={() => runOrderAction(() => withdrawRefund(activeApplying.refundNo), '退款申请已撤回')}>撤回退款</PillButton>
      : null

  return (
    <div className={`screen ${pendingPay ? 'has-bar-tall' : 'has-bar'}`}>
      <AppBar title={pendingPay ? '收银台' : '订单详情'} fallback="/orders" />
      <div className="body-pad">
        {loadFailed && <div className="notice">网络不稳定，订单状态可能不是最新</div>}

        {pendingPay ? <>
          <Cashier order={order} onExpire={() => void refresh()} />
          <Card>
            <div className="section-heading"><h2 className="card-title">余额支付</h2><button className="text-action" disabled={balanceLoading || busy} onClick={() => void refreshBalance()}>{balanceLoading ? '刷新中…' : '刷新余额'}</button></div>
            <div className="pay-row">
              <span className="pay-icon" aria-hidden="true">余</span>
              <div className="pay-main">
                <div className="name">从本店会员余额支付</div>
                {balanceLoading && <div className="sub" role="status">正在查询余额…</div>}
                {balanceFailed && <div className="sub" role="status">余额查询失败，请刷新重试</div>}
                {!balanceLoading && balance !== null && (
                  <div className={`sub ${balance < order.payAmount ? 'danger' : ''}`.trim()}>
                    当前余额 ¥{yuan(balance)}{balance < order.payAmount ? `，还差 ¥${yuan(order.payAmount - balance)}，请联系店员充值` : ''}
                  </div>
                )}
              </div>
              <span className="pay-radio" aria-hidden="true" />
            </div>
          </Card>
        </> : <StatusCard order={order} />}

        <Card>
          <div className="kv"><span>桌号</span><span>{order.tableCode}桌</span></div>
          <div className="kv">
            <span>订单号</span>
            <span>
              {order.orderNo}
              <button className="mini-btn" style={{ marginLeft: 8 }} onClick={async () => notify((await copyText(order.orderNo)) ? '订单号已复制' : '复制失败，请长按选择')}>复制</button>
            </span>
          </div>
          <div className="kv"><span>下单时间</span><span>{dateTime(order.createdAt)}</span></div>
          {order.paidAt && <div className="kv"><span>支付时间</span><span>{dateTime(order.paidAt)}</span></div>}
          <div className="kv"><span>就餐人数</span><span>{order.peopleCount} 人</span></div>
          {order.remark && <div className="kv"><span>备注</span><span>{order.remark}</span></div>}
        </Card>

        <Card>
          <h2 className="card-title">菜品明细（{itemCount} 件）</h2>
          {order.items.map((item) => (
            <div className="li" key={item.id}>
              <span className="li-name">
                {item.dishName}
                {itemOptionsText(item) && <span className="li-sub">{itemOptionsText(item)}</span>}
                {item.refundedQty > 0 && <span className="li-sub">已退 {item.refundedQty} 份</span>}
              </span>
              <span className="li-qty">x{item.quantity}</span>
              <span className="li-amt">¥{yuan(item.totalPrice)}</span>
            </div>
          ))}
        </Card>

        <Card>
          <div className="kv"><span>菜品小计</span><span>¥{yuan(order.totalAmount)}</span></div>
          {order.refundedAmount > 0 && <div className="kv accent"><span>已退款</span><span>-¥{yuan(order.refundedAmount)}</span></div>}
          <div className="kv strong"><span>实付</span><span>¥{yuan(order.payAmount)}</span></div>
        </Card>

        {order.refunds.length > 0 && (
          <Card>
            <h2 className="card-title">退款记录</h2>
            {order.refunds.map((refund) => <RefundRecordView key={refund.refundNo} refund={refund} />)}
          </Card>
        )}

        {order.canApplyRefund && (
          <Card className="after-sale">
            <div>
              <h2 className="card-title" style={{ marginBottom: 6 }}>售后服务</h2>
              <div className="t-cap">如菜品存在问题，建议先联系店员协助处理。</div>
            </div>
            <button className="entry" disabled={busy} onClick={() => setRefundOpen(true)}>申请退款 ›</button>
          </Card>
        )}

        {logs.length > 0 && (
          <Card>
            <h2 className="card-title">订单进度</h2>
            <div className="timeline">
              {logs.map((log, index) => (
                <div className={`tl-item ${index === 0 ? 'top' : ''}`.trim()} key={`${log.toStatus}-${log.createdAt}-${index}`}>
                  <div className="tl-title">{statusLogText(log.toStatus, log.operatorType)}</div>
                  <div className="tl-time">
                    {log.remark && log.operatorType !== 'CUSTOMER' ? `${log.remark} · ` : ''}{dateTimeWithSeconds(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <RefundSheet
          visible={refundOpen}
          items={order.items}
          refundableAmount={order.refundableAmount}
          busy={busy}
          onClose={() => setRefundOpen(false)}
          onSubmit={(reason, items) => {
            setRefundOpen(false)
            void runOrderAction(async () => {
              await applyRefund(orderNo, reason, items)
              await alertDialog('退款申请已提交', '商家审核通过后会退回到你的余额，可在本页查看进度')
            })
          }}
        />
      </div>

      {pendingPay ? (
        <BottomBar stack>
          <PillButton size="lg" block loading={busy || (insufficient && balanceLoading)} loadingLabel={busy ? '正在处理…' : '刷新中…'} onClick={insufficient ? refreshBalance : pay}>{insufficient ? '充值后刷新余额' : `确认支付 ¥${yuan(order.payAmount)}`}</PillButton>
          <div className="bar-hint">
            支付失败可在「我的订单」中重新支付
            {order.canCancel && <> · <button className="link" disabled={busy} onClick={cancel}>取消订单</button></>}
          </div>
        </BottomBar>
      ) : (
        <BottomBar>
          {secondary}
          <PillButton className="grow" onClick={() => router.push(menuPath(table?.qrToken))}>继续加菜</PillButton>
        </BottomBar>
      )}
    </div>
  )
}

export default function OrderPage() {
  return <Suspense><OrderView /></Suspense>
}
