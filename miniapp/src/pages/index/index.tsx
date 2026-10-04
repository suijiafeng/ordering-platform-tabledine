import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { fetchMe, resolveQr } from '../../api/customer'
import type { CustomerProfile } from '../../api/types'
import { useTableStore } from '../../store/table'
import { extractQrToken, parseTokenFromLink } from '../../utils/scene'
import './index.css'

/**
 * 点餐首页（第 1 周骨架）：
 * - 解析桌码 → 展示店铺与桌号
 * - 静默登录 → 展示当前顾客，验证认证闭环
 * 菜单、购物车在第 2 周接入。
 */
export default function Index() {
  const router = useRouter()
  const { current, pendingToken, setPendingToken, setCurrent, restoreLast } = useTableStore()
  const [me, setMe] = useState<CustomerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTable = async (token: string) => {
    setLoading(true)
    setError(null)
    try {
      setCurrent(await resolveQr(token, true))
    } catch (e) {
      setError((e as Error).message || '桌码无效')
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    const token = extractQrToken(router.params as Record<string, unknown>) ?? pendingToken
    if (token) {
      setPendingToken(null)
      loadTable(token)
    } else if (!current) {
      restoreLast()
    }
    fetchMe().then(setMe).catch(() => setMe(null))
  })

  const handleScan = async () => {
    try {
      const res = await Taro.scanCode({ onlyFromCamera: true })
      const token = parseTokenFromLink(res.result)
      if (!token) {
        Taro.showToast({ title: '不是本店的桌码', icon: 'none' })
        return
      }
      loadTable(token)
    } catch {
      // 用户取消扫码
    }
  }

  return (
    <View className='page'>
      <View className='card'>
        {current ? (
          <>
            <Text className='store-name'>{current.storeName}</Text>
            <Text className='table'>桌号 {current.tableCode}</Text>
            {!current.storeOpen && <Text className='warn'>店铺已打烊，暂不能下单</Text>}
          </>
        ) : (
          <>
            <Text className='store-name'>请扫描桌上的二维码点餐</Text>
            <Button className='scan-btn' onClick={handleScan} loading={loading}>扫一扫</Button>
          </>
        )}
        {error && <Text className='warn'>{error}</Text>}
      </View>

      <View className='card placeholder'>
        <Text>菜单与购物车将在第 2 周接入</Text>
      </View>

      <View className='footer'>
        <Text className='muted'>
          {me ? `已登录 · ${me.platform === 'ALIPAY' ? '支付宝' : '微信'}顾客 #${me.id}` : '登录中…'}
        </Text>
        <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}>我的订单</Text>
      </View>
    </View>
  )
}
