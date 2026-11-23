'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, Suspense, useState } from 'react'
import { applyRefund, cancelOrder, payOrder, requestCancelOrder, withdrawRefund } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import {
  countdownText, dateTime, dateTimeWithSeconds, itemOptionsText, orderStatusDesc, payNote, refundStatusText, statusLogText, yuan,
} from '@/lib/format'
import { cookingMinutes, isActiveOrder, lastUpdatedLabel, PROGRESS_STEPS, progressIndex, progressTimes, statusHeroTitle } from '@/lib/orderProgress'
import type { OrderDetail, RefundRecord } from '@/lib/types'
import { useMemberBalance } from '@/hooks/useMemberBalance'
import { useCountdown } from '@/hooks/useCountdown'
import { useOrderPolling } from '@/hooks/useOrderPolling'
import { RefundSheet } from '@/components/RefundSheet'
import { notify } from '@/store/feedback'
import { alertDialog, confirmDialog, copyText } from '@/lib/ui'
import { menuPath } from '@/lib/navigation'
import { useOrdering } from '@/store/ordering'
import { AppBar, BottomBar, Card, EmptyState, PillButton, Skeleton } from '@/components/ui'

function statusDesc(order: OrderDetail) {
  if (order.cancelReason) return order.cancelReason
  const minutes = cookingMinutes(order)
  if (order.status === 'MAKING' && minutes != null) {
    return `已开始制作 ${minutes} 分钟，出餐后服务员送到 ${order.tableCode} 桌`
  }
  if (order.status === 'READY') return `菜品已做好，服务员即将送到 ${order.tableCode} 桌`
  if (order.status === 'DONE') return `已送达 ${order.tableCode} 桌，感谢光临，欢迎再来`
  return orderStatusDesc(order.status, order.cookingStartedAt)
}

function StatusCard({ order }: { order: OrderDetail }) {
  const now = progressIndex(order.status, order.cookingStartedAt)
  const times = progressTimes(order)
  const updated = lastUpdatedLabel(order)
  const tone = order.status === 'DONE' ? 'done' : order.status === 'CANCELLED' || order.status === 'CLOSED' ? 'muted' : 'active'
  return (
    <div className={`status-card ${tone}`}>
      <div className="status-card-top">
        <div>
          <div className="title">{statusHeroTitle(order.status, order.cookingStartedAt)}</div>
          <div className="desc">{statusDesc(order)}</div>
        </div>
        {updated && isActiveOrder(order.status) && order.status !== 'DONE' && <span className="status-updated">{updated}</span>}
      </div>
      {now !== null && (
        <div className="steps">
          {PROGRESS_STEPS.map((label, index) => (
            <div
              key={label}
              aria-current={index === now ? 'step' : undefined}
              className={`step ${index <= now ? 'done' : ''} ${index === now ? 'now' : ''}`.trim()}
            >
              <span className="pt">{index <= now ? '✓' : ''}</span>
              <span className="step-label">{label}</span>
              {times[index] && <span className="step-time">{times[index]}</span>}
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
  const { balance, loading: balanceLoading, failed: balanceFailed, refresh: refreshBalance } = useMemberBalance(pendingPay || order?.status === 'DONE')
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
    if (busy || !order || insufficient || !(await confirmDialog(`确认支付 ¥${yuan(order.payAmount)}？`, payNote(balance, order.payAmount), '确认支付'))) return
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

  // 撤回后这笔退款申请作废；超过售后时限就不能再申请，所以要先确认
  const withdraw = async () => {
    const applying = order?.refunds.find((refund) => refund.status === 'APPLYING')
    if (!applying || !(await confirmDialog('撤回退款申请？', `撤回后这笔 ¥${yuan(applying.amount)} 的退款申请作废；超过售后时限将无法再次申请。`, '确认撤回'))) return
    void runOrderAction(() => withdrawRefund(applying.refundNo), '退款申请已撤回')
  }

  // 商家已接单：不能直接取消，提交申请等商家确认（后厨开始制作后就不能申请了）
  const requestCancel = async () => {
    if (!(await confirmDialog('申请取消订单？', '商家已接单，需商家确认后才能取消；同意后金额会退回到余额。每笔订单只能申请一次。', '提交申请'))) return
    void runOrderAction(() => requestCancelOrder(orderNo), '已提交取消申请，等待商家确认')
  }

  if (!order) {
    return (
      <div className="screen">
        <AppBar title="订单详情" fallback="/orders" />
        {fatal
          ? <EmptyState title={fatal} action={<PillButton onClick={() => router.replace('/orders')}>查看全部订单</PillButton>} />
          : loadFailed
            ? <EmptyState icon="!" title="订单加载失败" desc="正在自动重试…" action={<PillButton onClick={() => void refresh()}>立即重试</PillButton>} />
            : <Skeleton rows={3} variant="card" label="订单加载中…" />}
      </div>
    )
  }

  const activeApplying = order.refunds.find((refund) => refund.status === 'APPLYING')
  // 后厨开工不是订单状态变化，单独插入时间线
  const logs = [...order.logs, ...(order.cookingStartedAt ? [{ toStatus: 'MAKING' as const, operatorType: 'KITCHEN', remark: null, createdAt: order.cookingStartedAt }] : [])]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .reverse()
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className={`screen ${pendingPay ? 'has-bar-tall' : ''}`}>
      <AppBar title={pendingPay ? '收银台' : '订单详情'} fallback="/orders" />
      <div className="body-pad">
        {loadFailed && <div className="notice">网络不稳定，订单状态可能不是最新</div>}
        {order.cancelRequest?.status === 'APPLYING' && <div className="notice">已申请取消，等待商家确认；确认前后厨不会开始制作</div>}
        {order.cancelRequest?.status === 'REJECTED' && (
          <div className="notice">商家未同意取消{order.cancelRequest.rejectReason ? `：${order.cancelRequest.rejectReason}` : ''}，订单继续制作</div>
        )}

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
        </> : <>
          <StatusCard order={order} />
          <Card className="order-next">
            {order.status === 'DONE' ? (
              <>
                <h2 className="card-title">接下来</h2>
                <div className="order-next-grid">
                  <button type="button" className="order-next-card" onClick={() => router.push(menuPath(table?.qrToken))}>
                    <strong>同桌再点一单</strong>
                    <span>会生成新订单，单独支付</span>
                  </button>
                  <button type="button" className="order-next-card" onClick={() => router.push('/wallet')}>
                    <strong>查看余额流水</strong>
                    <span>{balance !== null ? `本单 −¥${yuan(order.payAmount)} · 剩 ¥${yuan(balance)}` : '查看充值、消费与退款'}</span>
                  </button>
                </div>
                <div className="order-next-foot">
                  <span>菜品有问题？</span>
                  {order.canApplyRefund
                    ? <button type="button" className="refund-link" disabled={busy} onClick={() => setRefundOpen(true)}>申请退款 ›</button>
                    : <span className="t-cap">请联系店员协助</span>}
                </div>
              </>
            ) : order.status === 'CANCELLED' || order.status === 'CLOSED' ? (
              <PillButton className="grow" variant="outline" onClick={() => router.push(menuPath(table?.qrToken))}>同桌再点一单</PillButton>
            ) : (
              <>
                <div className="order-next-btns">
                  <PillButton variant="outline" className="grow" disabled={busy} onClick={() => void refresh()}>刷新进度</PillButton>
                  <PillButton variant="outline" className="grow" onClick={() => router.push(menuPath(table?.qrToken))}>同桌再点一单</PillButton>
                </div>
                {(() => {
                  const cooking = order.status === 'MAKING' || order.status === 'READY'
                  const parts = [
                    cooking ? '已开始制作，如需取消请联系店员' : null,
                    order.canCancel ? <button type="button" className="link" disabled={busy} onClick={cancel}>取消订单</button> : null,
                    order.canRequestCancel ? <button type="button" className="link" disabled={busy} onClick={requestCancel}>申请取消</button> : null,
                    activeApplying ? <button type="button" className="link" disabled={busy} onClick={withdraw}>撤回退款</button> : null,
                  ].filter((p) => p != null)
                  if (!parts.length) return null
                  return (
                    <p className="order-next-hint">
                      {parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>)}
                    </p>
                  )
                })()}
                {order.canApplyRefund && (
                  <div className="order-next-foot">
                    <span>菜品有问题？</span>
                    <button type="button" className="refund-link" disabled={busy} onClick={() => setRefundOpen(true)}>申请退款 ›</button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>}

        <Card>
          <div className="section-heading"><h2 className="card-title">菜品明细 <span className="card-count">{itemCount} 件</span></h2></div>
          {order.items.map((item) => (
            <div className="li" key={item.id}>
              <span className="li-tile" aria-hidden="true">{item.dishName.trim().charAt(0) || '菜'}</span>
              <span className="li-name">
                {item.dishName}
                {itemOptionsText(item) && <span className="li-sub">{itemOptionsText(item)}</span>}
                {item.refundedQty > 0 && <span className="li-sub">已退 {item.refundedQty} 份</span>}
              </span>
              <span className="li-qty">×{item.quantity}</span>
              <span className="li-amt">¥{yuan(item.totalPrice)}</span>
            </div>
          ))}
          {order.refundedAmount > 0 && <div className="kv accent"><span>已退款</span><span>-¥{yuan(order.refundedAmount)}</span></div>}
          <div className="kv strong"><span>余额支付 · 实付</span><span>¥{yuan(order.payAmount)}</span></div>
        </Card>

        <Card>
          <div className="kv"><span>订单号</span><span>{order.orderNo} · <button type="button" className="link" onClick={async () => notify((await copyText(order.orderNo)) ? '订单号已复制' : '复制失败，请长按选择')}>复制</button></span></div>
          <div className="kv"><span>下单时间</span><span>{dateTime(order.createdAt)}</span></div>
          {order.paidAt && <div className="kv"><span>支付时间</span><span>{dateTime(order.paidAt)}</span></div>}
          <div className="kv"><span>就餐人数</span><span>{order.peopleCount} 人</span></div>
          {order.remark && <div className="kv"><span>备注</span><span>{order.remark}</span></div>}
        </Card>

        {order.refunds.length > 0 && (
          <Card>
            <h2 className="card-title">退款记录</h2>
            {order.refunds.map((refund) => <RefundRecordView key={refund.refundNo} refund={refund} />)}
          </Card>
        )}

        {logs.length > 0 && (
          <Card>
            <h2 className="card-title">订单进度</h2>
            <div className="timeline">
              {logs.map((log, index) => (
                <div className={`tl-item ${index === 0 ? 'top' : ''}`.trim()} key={`${log.toStatus}-${log.createdAt}-${index}`}>
                  <div className="tl-title">{log.operatorType === 'KITCHEN' ? '后厨开始制作' : statusLogText(log.toStatus, log.operatorType)}</div>
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

      {pendingPay && (
        <BottomBar stack>
          <PillButton size="lg" block loading={busy || (insufficient && balanceLoading)} loadingLabel={busy ? '正在处理…' : '刷新中…'} onClick={insufficient ? refreshBalance : pay}>{insufficient ? '充值后刷新余额' : `确认支付 ¥${yuan(order.payAmount)}`}</PillButton>
          <div className="bar-hint">
            支付失败可在「我的订单」中重新支付
            {order.canCancel && <> · <button className="link" disabled={busy} onClick={cancel}>取消订单</button></>}
          </div>
        </BottomBar>
      )}
    </div>
  )
}

export default function OrderPage() {
  return <Suspense><OrderView /></Suspense>
}
