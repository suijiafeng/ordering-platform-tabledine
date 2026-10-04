import { useCallback, useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { applyRefund, cancelOrder, fetchOrder, withdrawRefund } from '../../api/order'
import { ApiError, NOT_FOUND } from '../../utils/apiError'
import type { OrderDetail } from '../../api/types'
import RefundPopup from '../../components/RefundPopup'
import { formatYuan } from '../../utils/money'
import { formatTime, orderStatusText, refundStatusText } from '../../utils/order'
import { payOrder } from '../../utils/pay'
import './index.css'
import { ignoreShownError, isRefundUnresolved } from '../../utils/errors'

const POLL_MS = 5000

/** 订单详情：待支付/进行中状态自动轮询；支持继续支付、取消、申请退款、撤回退款 */
export default function OrderDetailPage() {
  const { orderNo = '' } = useRouter().params
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  /** 不可恢复的错误（订单不存在 / 账号不可用）：停止轮询并显示原因 */
  const [fatal, setFatal] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const fatalRef = useRef(false)
  const visible = useRef(false)

  const load = useCallback(async () => {
    try {
      const o = await fetchOrder(orderNo, true)
      setOrder(o)
      setLoadFailed(false)
      return o
    } catch (e) {
      // 首次加载 / 轮询：请求带 silent，由页面展示错误状态
      if (!(e instanceof ApiError)) {
        throw e
      }
      if (e.code === NOT_FOUND) {
        setFatal('订单不存在或不属于当前账号')
      } else if (e.statusCode === 401 || e.code === 40103) {
        setFatal(e.message || '账号不可用')
      } else {
        setLoadFailed(true)
      }
      return null
    }
  }, [orderNo])

  const poll = useCallback(async () => {
    clearTimeout(timer.current)
    if (!visible.current) return
    const o = await load()
    // 请求期间页面可能已离开（onUnload 不触发 onHide），不要再排下一次
    if (!visible.current) return
    // FAILED 在后端同样是「进行中」（商家可重试 / 线下登记），要继续轮询直到有终态
    const settled = o != null && ['DONE', 'CLOSED', 'CANCELLED'].includes(o.status)
      && !o.refunds.some((r) => isRefundUnresolved(r.status))
    // 一次失败不终止轮询，下次自动恢复；不可恢复错误（订单不存在等）则停止
    if (!settled && !fatalRef.current) {
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
  useEffect(
    () => () => {
      visible.current = false
      clearTimeout(timer.current)
    },
    [],
  )

  const runOrderAction = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await load()
      poll()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示
    } finally {
      setBusy(false)
    }
  }

  const onPay = () => runOrderAction(async () => {
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
    if (confirm) runOrderAction(() => cancelOrder(orderNo))
  }

  const onRefundSubmit = (reason: string, selection: { orderItemId: number; quantity: number }[]) => {
    setRefundOpen(false)
    runOrderAction(async () => {
      await applyRefund(orderNo, reason, selection)
      Taro.showToast({ title: '已提交，等待商家审核', icon: 'none' })
    })
  }

  /** 从列表进来的就返回列表，否则替换当前页，避免 列表→详情→列表→… 把页面栈撑满 */
  const goOrderList = () => {
    const pages = Taro.getCurrentPages()
    const prev = pages[pages.length - 2]
    if (prev && String(prev.route ?? '').includes('order-list')) {
      Taro.navigateBack()
    } else {
      Taro.redirectTo({ url: '/pages/order-list/index' })
    }
  }

  const onWithdraw = (refundNo: string) => runOrderAction(() => withdrawRefund(refundNo))

  fatalRef.current = fatal != null

  if (!order) {
    return (
      <View className='od-loading'>
        <Text>{fatal ?? (loadFailed ? '加载失败，正在重试…' : '加载中…')}</Text>
        {fatal && <Text className='od-link' onClick={goOrderList}>查看全部订单</Text>}
      </View>
    )
  }

  const activeApplying = order.refunds.find((r) => r.status === 'APPLYING')

  return (
    <View className='od-page'>
      <View className='od-status'>
        <Text className='od-status-text'>{orderStatusText(order.status)}</Text>
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
                <Text className='od-refund-status'>{refundStatusText(r.status)}</Text>
              </View>
              <Text className='od-row-desc'>原因：{r.reason}</Text>
              {r.rejectReason && <Text className='od-row-desc'>商家回复：{r.rejectReason}</Text>}
              {r.status === 'FAILED' && r.failReason && <Text className='od-row-desc'>失败原因：{r.failReason}，商家会重新处理</Text>}
            </View>
          ))}
        </View>
      )}

      <View className='od-actions'>
        {order.status === 'PENDING_PAY' && <View className='od-btn primary' onClick={onPay}><Text>继续支付 ¥{formatYuan(order.payAmount)}</Text></View>}
        {order.canCancel && <View className='od-btn' onClick={onCancel}><Text>取消订单</Text></View>}
        {activeApplying && <View className='od-btn' onClick={() => onWithdraw(activeApplying.refundNo)}><Text>撤回退款申请</Text></View>}
        {order.canApplyRefund && <View className='od-btn' onClick={() => setRefundOpen(true)}><Text>申请退款</Text></View>}
        <View className='od-btn' onClick={goOrderList}><Text>全部订单</Text></View>
      </View>
      {refundOpen && <RefundPopup items={order.items} refundableAmount={order.refundableAmount} onClose={() => setRefundOpen(false)} onSubmit={onRefundSubmit} />}
    </View>
  )
}
