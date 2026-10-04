import { useCallback, useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { fetchOrders } from '../../api/order'
import type { OrderSummary } from '../../api/types'
import { formatYuan } from '../../utils/money'
import { formatTime, orderStatusText } from '../../utils/order'
import './index.css'

const PAGE_SIZE = 20

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

  useDidShow(() => {
    void load(1)
  })
  usePullDownRefresh(() => {
    void load(1)
  })
  useReachBottom(() => {
    if (!loading && list.length < total) void load(page + 1)
  })

  if (loaded && list.length === 0) {
    return (
      <View className='ol-empty' onClick={() => failed && load(1)}>
        <Text>{failed ? '加载失败，点击重试' : '暂无订单'}</Text>
      </View>
    )
  }

  return (
    <View className='ol-page'>
      {list.map((o) => (
        <View key={o.orderNo} className='ol-card' onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?orderNo=${o.orderNo}` })}>
          <View className='ol-head'>
            <Text className='ol-time'>{formatTime(o.createdAt)} · 桌号 {o.tableCode}</Text>
            <Text className={`ol-status s-${o.status}`}>{orderStatusText(o.status)}</Text>
          </View>
          <Text className='ol-dishes'>
            {o.items.slice(0, 3).map((i) => `${i.dishName}x${i.quantity}`).join('、')}
            {o.itemCount > 3 ? ' 等' : ''}
          </Text>
          <View className='ol-foot'>
            <Text className='ol-count'>共 {o.itemCount} 件</Text>
            <Text className='ol-amount'>¥{formatYuan(o.totalAmount)}</Text>
          </View>
        </View>
      ))}
      {loaded && list.length >= total && list.length > 0 && <Text className='ol-end'>没有更多了</Text>}
    </View>
  )
}
