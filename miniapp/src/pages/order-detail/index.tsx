import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { Button, Step, Steps } from '@nutui/nutui-react-taro'
import { applyRefund, cancelOrder, withdrawRefund } from '../../api/order'
import PageShell from '../../components/PageShell'
import RefundPopup from '../../components/RefundPopup'
import { formatYuan } from '../../utils/money'
import { formatCountdown, formatTime, formatTimeWithSeconds, orderStatusText, refundStatusText, statusLogText } from '../../utils/order'
import { payOrder } from '../../utils/pay'
import './index.css'
import { confirm } from '../../utils/dialog'
import { ignoreShownError } from '../../utils/errors'
import { useOrderPolling } from '../../hooks/useOrderPolling'
import { useCountdown } from '../../hooks/useCountdown'
import { toast } from '../../utils/toast'

/** 订单详情：状态与退款进度自动刷新（见 useOrderPolling）；支持余额支付、取消、申请退款、撤回退款 */
export default function OrderDetailPage() {
  const { orderNo = '' } = useRouter().params
  const { order, loadFailed, fatal, refresh } = useOrderPolling(orderNo)
  const [busy, setBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  // 待支付倒计时：到期后立即刷新一次，让「已关闭」尽快呈现
  const paySecondsLeft = useCountdown(order?.status === 'PENDING_PAY' ? order.payExpireAt : null, () => { void refresh() })

  const runOrderAction = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setBusy(false)
    }
  }

  const onPay = () => runOrderAction(async () => {
    const outcome = await payOrder(orderNo)
    if (outcome === 'fail') toast('支付未完成，请重试')
  })

  const onCancel = async () => {
    const paid = order?.status !== 'PENDING_PAY'
    if (await confirm('取消订单', paid ? '取消后款项将退回账户余额，确认取消？' : '确认取消该订单？')) {
      void runOrderAction(() => cancelOrder(orderNo))
    }
  }

  const onRefundSubmit = (reason: string, selection: { orderItemId: number; quantity: number }[]) => {
    setRefundOpen(false)
    void runOrderAction(async () => {
      await applyRefund(orderNo, reason, selection)
      toast('已提交，等待商家审核')
    })
  }

  /** 从列表进来的就返回列表，否则替换当前页，避免页面栈无限增长 */
  const goOrderList = () => {
    const pages = Taro.getCurrentPages()
    const prev = pages[pages.length - 2]
    if (prev && String(prev.route ?? '').includes('order-list')) {
      void Taro.navigateBack()
    } else {
      void Taro.redirectTo({ url: '/pages/order-list/index' })
    }
  }

  if (!order) {
    return (
      <PageShell>
        <View className='od-loading'>
          <Text>{fatal ?? (loadFailed ? '加载失败，正在重试…' : '加载中…')}</Text>
          {fatal && <Button size='small' style={{ marginTop: '24px' }} onClick={goOrderList}>查看全部订单</Button>}
        </View>
      </PageShell>
    )
  }

  const activeApplying = order.refunds.find((r) => r.status === 'APPLYING')
  const logs = [...order.logs].reverse()

  return (
    <PageShell>
      <View className='od-page'>
        <View className='od-status'>
          <Text className='od-status-text'>{orderStatusText(order.status)}</Text>
          {order.status === 'PENDING_PAY' && (
            paySecondsLeft != null && paySecondsLeft > 0
              ? <Text className='od-sub'>剩余 <Text className='od-countdown'>{formatCountdown(paySecondsLeft)}</Text> 完成支付，超时将自动关闭</Text>
              : <Text className='od-sub'>支付已超时，订单即将关闭</Text>
          )}
          {order.status === 'CANCELLED' && order.cancelReason && <Text className='od-sub'>{order.cancelReason}</Text>}
        </View>

        <View className='od-card'>
          <Text className='od-store'>{order.storeName} · 桌号 {order.tableCode}</Text>
          {order.items.map((i) => (
            <View key={i.id} className='od-row'>
              <View className='od-row-info'>
                <Text className='od-row-name'>{i.dishName}</Text>
                {(i.specDesc || i.addonDesc) && <Text className='od-row-desc'>{[i.specDesc, i.addonDesc].filter(Boolean).join(' · ')}</Text>}
                {i.refundedQty > 0 && <Text className='od-row-desc'>已退 {i.refundedQty} 份</Text>}
              </View>
              <Text className='od-row-qty'>x{i.quantity}</Text>
              <Text className='od-row-price'>¥{formatYuan(i.totalPrice)}</Text>
            </View>
          ))}
          <View className='od-sum'>
            <Text>实付 </Text>
            <Text className='od-sum-price'>¥{formatYuan(order.payAmount)}</Text>
          </View>
          {order.refundedAmount > 0 && <Text className='od-refunded'>已退款 ¥{formatYuan(order.refundedAmount)}</Text>}
        </View>

        <View className='od-card'>
          <Text className='od-line'>订单号：{order.orderNo}</Text>
          <Text className='od-line'>下单时间：{formatTime(order.createdAt)}</Text>
          <Text className='od-line'>就餐人数：{order.peopleCount}</Text>
          {order.remark && <Text className='od-line'>备注：{order.remark}</Text>}
        </View>

        {order.refunds.length > 0 && (
          <View className='od-card'>
            <Text className='od-store'>退款记录</Text>
            {order.refunds.map((r) => (
              <View key={r.refundNo} className='od-refund'>
                <View className='od-refund-head'>
                  <Text>¥{formatYuan(r.amount)}</Text>
                  <Text className='od-refund-status'>{refundStatusText(r.status)}</Text>
                </View>
                {r.items.length > 0 && (
                  <Text className='od-row-desc'>退款菜品：{r.items.map((it) => `${it.dishName}${it.specDesc ? `（${it.specDesc}）` : ''} x${it.quantity}`).join('、')}</Text>
                )}
                <Text className='od-row-desc'>申请时间：{formatTime(r.createdAt)}</Text>
                <Text className='od-row-desc'>原因：{r.reason}</Text>
                {r.rejectReason && <Text className='od-row-desc'>商家回复：{r.rejectReason}</Text>}
                {r.status === 'FAILED' && r.failReason && <Text className='od-row-desc'>失败原因：{r.failReason}，商家会重新处理</Text>}
              </View>
            ))}
          </View>
        )}

        {logs.length > 0 && (
          <View className='od-card'>
            <Text className='od-store'>订单进度</Text>
            <Steps direction='vertical' type='dot' value={1}>
              {logs.map((l, idx) => (
                <Step
                  key={`${l.toStatus}-${l.createdAt}-${idx}`}
                  value={idx + 1}
                  title={statusLogText(l.toStatus, l.operatorType)}
                  description={`${l.remark && l.operatorType !== 'CUSTOMER' ? `${l.remark} · ` : ''}${formatTimeWithSeconds(l.createdAt)}`}
                />
              ))}
            </Steps>
          </View>
        )}

        <View className='od-actions'>
          {order.status === 'PENDING_PAY' && <Button type='primary' size='large' block loading={busy} onClick={onPay}>余额支付 ¥{formatYuan(order.payAmount)}</Button>}
          <View className='od-actions-row'>
            {order.canCancel && <Button disabled={busy} onClick={onCancel}>取消订单</Button>}
            {activeApplying && <Button disabled={busy} onClick={() => runOrderAction(() => withdrawRefund(activeApplying.refundNo))}>撤回退款申请</Button>}
            {order.canApplyRefund && <Button disabled={busy} onClick={() => setRefundOpen(true)}>申请退款</Button>}
            <Button onClick={goOrderList}>全部订单</Button>
          </View>
        </View>
        <RefundPopup visible={refundOpen} items={order.items} refundableAmount={order.refundableAmount} onClose={() => setRefundOpen(false)} onSubmit={onRefundSubmit} />
      </View>
    </PageShell>
  )
}
