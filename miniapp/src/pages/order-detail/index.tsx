import { useCallback, useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { applyRefund, cancelOrder, fetchOrder, withdrawRefund } from '../../api/order'
import type { OrderDetail } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { formatTime, ORDER_STATUS_TEXT, REFUND_STATUS_TEXT } from '../../utils/order'
import { payOrder } from '../../utils/pay'
import './index.css'

const POLL_MS = 5000

/** 订单详情：待支付/进行中状态自动轮询；支持继续支付、取消、申请退款、撤回退款 */
export default function OrderDetailPage() {
  const { orderNo = '' } = useRouter().params
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const visible = useRef(false)

  const load = useCallback(async () => {
    try {
      const o = await fetchOrder(orderNo, true)
      setOrder(o)
      return o
    } catch {
      return null
    }
  }, [orderNo])

  const poll = useCallback(async () => {
    clearTimeout(timer.current)
    if (!visible.current) return
    const o = await load()
    const hasActiveRefund = o?.refunds.some((r) => r.status === 'APPLYING' || r.status === 'PROCESSING')
    if (o && (!['DONE', 'CLOSED', 'CANCELLED'].includes(o.status) || hasActiveRefund)) {
      timer.current = setTimeout(poll, POLL_MS)
    }
  }, [load])

  useDidShow(() => {
    visible.current = true
    poll()
  })
  useDidHide(() => {
    visible.current = false
    clearTimeout(timer.current)
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await load()
      poll()
    } catch {
      // request 层已提示
    } finally {
      setBusy(false)
    }
  }

  const onPay = () => run(async () => {
    const outcome = await payOrder(orderNo)
    if (outcome === 'cancel') Taro.showToast({ title: '已取消支付', icon: 'none' })
    if (outcome === 'fail') Taro.showToast({ title: '支付未完成，请重试', icon: 'none' })
  })

  const onCancel = async () => {
    const paid = order?.status !== 'PENDING_PAY'
    const { confirm } = await Taro.showModal({
      title: '取消订单',
      content: paid ? '取消后将原路全额退款，确认取消？' : '确认取消该订单？',
    })
    if (confirm) run(() => cancelOrder(orderNo))
  }

  const onRefund = async () => {
    const res = await Taro.showModal({
      title: '申请退款',
      content: '',
      editable: true,
      placeholderText: '请填写退款原因',
    } as Taro.showModal.Option)
    const reason = ((res as { content?: string }).content ?? '').trim()
    if (!res.confirm) return
    if (!reason) {
      Taro.showToast({ title: '请填写退款原因', icon: 'none' })
      return
    }
    run(() => applyRefund(orderNo, reason))
  }

  const onWithdraw = (refundNo: string) => run(() => withdrawRefund(refundNo))

  if (!order) {
    return <View className='od-loading'><Text>加载中…</Text></View>
  }

  const activeApplying = order.refunds.find((r) => r.status === 'APPLYING')

  return (
    <View className='od-page'>
      <View className='od-status'>
        <Text className='od-status-text'>{ORDER_STATUS_TEXT[order.status]}</Text>
        {order.status === 'PENDING_PAY' && <Text className='od-sub'>请在 {formatTime(order.payExpireAt)} 前完成支付，超时将自动关闭</Text>}
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
                <Text className='od-refund-status'>{REFUND_STATUS_TEXT[r.status]}</Text>
              </View>
              <Text className='od-row-desc'>原因：{r.reason}</Text>
              {r.rejectReason && <Text className='od-row-desc'>商家回复：{r.rejectReason}</Text>}
            </View>
          ))}
        </View>
      )}

      <View className='od-actions'>
        {order.status === 'PENDING_PAY' && <View className='od-btn primary' onClick={onPay}><Text>继续支付 ¥{formatYuan(order.payAmount)}</Text></View>}
        {order.canCancel && <View className='od-btn' onClick={onCancel}><Text>取消订单</Text></View>}
        {activeApplying && <View className='od-btn' onClick={() => onWithdraw(activeApplying.refundNo)}><Text>撤回退款申请</Text></View>}
        {order.canApplyRefund && <View className='od-btn' onClick={onRefund}><Text>申请退款</Text></View>}
        <View className='od-btn' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}><Text>全部订单</Text></View>
      </View>
    </View>
  )
}
