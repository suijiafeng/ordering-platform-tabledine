import { useCallback, useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { Button, Empty, Tag } from '@nutui/nutui-react-taro'
import { fetchOrders } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import PageShell from '../../components/PageShell'
import { formatYuan } from '../../utils/money'
import { formatCountdown, formatTime, orderStatusText } from '../../utils/order'
import { useCountdown } from '../../hooks/useCountdown'
import './index.css'

const PAGE_SIZE = 20

/** 待支付订单的剩余时间；到期后提示即将关闭 */
function PendingPayHint({ payExpireAt }: { payExpireAt: string | null }) {
  const left = useCountdown(payExpireAt)
  if (left == null) return null
  return left > 0
    ? <Text className='ol-countdown'>剩余 {formatCountdown(left)} 支付</Text>
    : <Text className='ol-countdown expired'>支付已超时，订单即将关闭</Text>
}

function statusTagType(s: OrderSummary['status']): 'primary' | 'success' | 'default' {
  if (s === 'DONE') return 'success'
  if (s === 'CLOSED' || s === 'CANCELLED') return 'default'
  return 'primary'
}

/** 我的订单：按时间倒序，下拉刷新，触底加载更多 */
export default function OrderList() {
  const [list, setList] = useState<OrderSummary[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // 刷新与加载更多可能交错：只采纳最后一次发起的请求
  const seq = useRef(0)

  const load = useCallback(async (p: number) => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const res = await fetchOrders(p, PAGE_SIZE)
      if (mine !== seq.current) return
      setList((old) => {
        if (p === 1) return res.list
        const seen = new Set(old.map((o) => o.orderNo))
        return [...old, ...res.list.filter((o) => !seen.has(o.orderNo))]
      })
      setPage(p)
      setTotal(res.total)
      setFailed(false)
    } catch {
      if (mine === seq.current) setFailed(true)  // request 层已提示
    } finally {
      if (mine === seq.current) {
        setLoading(false)
        setLoaded(true)
      }
      Taro.stopPullDownRefresh()
    }
  }, [])

  useDidShow(() => { void load(1) })
  usePullDownRefresh(() => { void load(1) })
  useReachBottom(() => {
    if (!loading && list.length < total) void load(page + 1)
  })

  if (loaded && list.length === 0) {
    return (
      <PageShell>
        <Empty
          status={failed ? 'error' : 'empty'}
          description={failed ? '加载失败' : '暂无订单'}
          actions={failed ? [{ text: '重试', type: 'primary', onClick: () => () => load(1) }] : []}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <View className='ol-page'>
        {list.map((o) => (
          <View key={o.orderNo} className='ol-card' onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?orderNo=${o.orderNo}` })}>
            <View className='ol-head'>
              <Text className='ol-time'>{formatTime(o.createdAt)} · 桌号 {o.tableCode}</Text>
              <Tag type={statusTagType(o.status)} plain={statusTagType(o.status) === 'default'}>{orderStatusText(o.status)}</Tag>
            </View>
            <Text className='ol-dishes'>
              {o.items.slice(0, 3).map((i) => `${i.dishName}x${i.quantity}`).join('、')}
              {o.itemCount > 3 ? ' 等' : ''}
            </Text>
            <View className='ol-foot'>
              {o.status === 'PENDING_PAY' ? <PendingPayHint payExpireAt={o.payExpireAt} /> : <View />}
              <View className='ol-foot-right'>
                <Text className='ol-count'>共 {o.itemCount} 件</Text>
                <Text className='ol-amount'>¥{formatYuan(o.payAmount)}</Text>
              </View>
            </View>
            {o.refundedAmount > 0 && <Text className='ol-refunded'>已退款 ¥{formatYuan(o.refundedAmount)}</Text>}
            {o.status === 'PENDING_PAY' && <Button type='primary' block size='small' style={{ marginTop: '16px' }}>去支付</Button>}
          </View>
        ))}
        {loaded && list.length >= total && list.length > 0 && <Text className='ol-end'>没有更多了</Text>}
      </View>
    </PageShell>
  )
}
