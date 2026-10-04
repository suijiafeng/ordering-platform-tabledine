import { useCallback, useEffect, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import { fetchMenu } from '../../api/menu'
import { resolveQr } from '../../api/customer'
import type { MenuDish, MenuView } from '../../api/types'
import CartBar from '../../components/CartBar'
import SpecPopup from '../../components/SpecPopup'
import Stepper from '../../components/Stepper'
import { dishQty, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan, imageUrl } from '../../utils/money'
import { defaultSelection, hasOptions } from '../../utils/price'
import { extractQrToken, parseTokenFromLink } from '../../utils/scene'
import './index.css'

/**
 * 点餐首页：扫码解析桌台 → 加载菜单 → 左侧分类 / 右侧菜品 → 规格弹层 → 购物车。
 */
export default function Index() {
  const router = useRouter()
  const { current, pendingToken, setPendingToken, setCurrent, restoreLast } = useTableStore()
  const { items, bindStore, add, changeQty, reconcile } = useCartStore()
  const [menu, setMenu] = useState<MenuView | null>(null)
  const [activeCat, setActiveCat] = useState<number | null>(null)
  const [scrollTarget, setScrollTarget] = useState('')
  const [specDish, setSpecDish] = useState<MenuDish | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingTable, setLoadingTable] = useState(false)

  const loadTable = async (token: string) => {
    setLoadingTable(true)
    setError(null)
    try {
      setCurrent({ ...(await resolveQr(token, true)), qrToken: token })
    } catch (e) {
      setError((e as Error).message || '桌码无效')
    } finally {
      setLoadingTable(false)
    }
  }

  const loadMenu = useCallback(async (storeId: number) => {
    const m = await fetchMenu(storeId)
    setMenu(m)
    setActiveCat((c) => c ?? m.categories[0]?.id ?? null)
    const removed = reconcile(m)
    if (removed.length) {
      Taro.showToast({ title: `${removed.join('、')} 已售罄或已变更，已移出购物车`, icon: 'none', duration: 2500 })
    }
  }, [reconcile])

  useDidShow(() => {
    const token = extractQrToken(router.params as Record<string, unknown>) ?? pendingToken
    if (token) {
      setPendingToken(null)
      loadTable(token)
    } else if (!current) {
      restoreLast()
    }
  })

  useEffect(() => {
    if (current) {
      Taro.setNavigationBarTitle({ title: current.storeName })
      bindStore(current.storeId)
      loadMenu(current.storeId).then(() => setError(null)).catch(() => setError('菜单加载失败，点击重试'))
    }
  }, [current, bindStore, loadMenu])

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

  const tapAdd = (dish: MenuDish) => {
    if (hasOptions(dish)) {
      setSpecDish(dish)
    } else {
      add(dish, defaultSelection(dish))
    }
  }

  /** 无规格菜品可直接减；有规格的在购物车里减 */
  const tapMinus = (dish: MenuDish) => {
    const item = items.find((i) => i.dishId === dish.id)
    if (!item) return
    if (hasOptions(dish) && items.filter((i) => i.dishId === dish.id).length > 1) {
      Taro.showToast({ title: '多种规格请在购物车中调整', icon: 'none' })
      return
    }
    changeQty(item.key, -1)
  }

  // ---------- 未扫码 ----------
  if (!current) {
    return (
      <View className='empty-page'>
        <Text className='empty-title'>请扫描桌上的二维码点餐</Text>
        {error && <Text className='warn'>{error}</Text>}
        <Button className='scan-btn' onClick={handleScan} loading={loadingTable}>扫一扫</Button>
        <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}>我的订单</Text>
      </View>
    )
  }

  return (
    <View className='page'>
      <View className='header'>
        <View>
          <Text className='store-name'>{current.storeName}</Text>
          <Text className='table-tag'>桌号 {current.tableCode}</Text>
        </View>
        <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}>我的订单</Text>
      </View>
      {!current.storeOpen && <View className='closed-tip'><Text>店铺已打烊，暂不能下单</Text></View>}
      {error && (
        <View className='closed-tip' onClick={() => loadMenu(current.storeId).then(() => setError(null)).catch(() => {})}>
          <Text>{error}</Text>
        </View>
      )}

      <View className='menu'>
        <ScrollView scrollY className='cats'>
          {menu?.categories.map((c) => {
            const qty = c.dishes.reduce((s, d) => s + dishQty(items, d.id), 0)
            return (
              <View
                key={c.id}
                className={`cat ${activeCat === c.id ? 'active' : ''}`}
                onClick={() => { setActiveCat(c.id); setScrollTarget(`cat-${c.id}`) }}
              >
                <Text>{c.name}</Text>
                {qty > 0 && <Text className='cat-badge'>{qty}</Text>}
              </View>
            )
          })}
        </ScrollView>

        <ScrollView scrollY className='dishes' scrollIntoView={scrollTarget} scrollWithAnimation>
          {menu && menu.categories.length === 0 && <Text className='muted center'>暂无菜品</Text>}
          {menu?.categories.map((c) => (
            <View key={c.id} id={`cat-${c.id}`}>
              <Text className='cat-title'>{c.name}</Text>
              {c.dishes.map((d) => (
                <View key={d.id} className={`dish ${d.soldOut ? 'sold-out' : ''}`}>
                  {d.image ? <Image className='dish-img' src={imageUrl(d.image)} mode='aspectFill' lazyLoad /> : <View className='dish-img' />}
                  <View className='dish-info'>
                    <Text className='dish-name'>{d.name}</Text>
                    {d.description && <Text className='dish-desc'>{d.description}</Text>}
                    <View className='dish-bottom'>
                      <Text className='dish-price'>¥{formatYuan(d.price)}{hasOptions(d) ? '起' : ''}</Text>
                      {d.soldOut ? (
                        <Text className='muted'>已售罄</Text>
                      ) : hasOptions(d) ? (
                        <View className='spec-btn' onClick={() => tapAdd(d)}>
                          <Text>选规格</Text>
                          {dishQty(items, d.id) > 0 && <Text className='spec-badge'>{dishQty(items, d.id)}</Text>}
                        </View>
                      ) : (
                        <Stepper value={dishQty(items, d.id)} onMinus={() => tapMinus(d)} onPlus={() => tapAdd(d)} />
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: '200px' }} />
        </ScrollView>
      </View>

      <CartBar
        disabled={!current.storeOpen}
        disabledText='已打烊'
        onCheckout={() => Taro.navigateTo({ url: '/pages/checkout/index' })}
      />
      <SpecPopup
        dish={specDish}
        onClose={() => setSpecDish(null)}
        onConfirm={(dish, sel, qty) => { add(dish, sel, qty); setSpecDish(null) }}
      />
    </View>
  )
}
