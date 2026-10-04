import { useCallback, useEffect, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import { Badge, Button, InputNumber, SearchBar } from '@nutui/nutui-react-taro'
import { fetchMenu } from '../../api/menu'
import { resolveQr } from '../../api/customer'
import type { MenuDish, MenuView } from '../../api/types'
import CartBar from '../../components/CartBar'
import PageShell from '../../components/PageShell'
import SpecPopup from '../../components/SpecPopup'
import { dishQty, useCartStore } from '../../store/cart'
import { useTableStore } from '../../store/table'
import { formatYuan, imageUrl } from '../../utils/money'
import { defaultSelection, hasOptions } from '../../utils/price'
import { extractQrToken, parseTokenFromLink } from '../../utils/scene'
import './index.css'
import { toast } from '../../utils/toast'
import { isH5 } from '../../utils/platform'

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
  // 菜品搜索：在已加载的菜单里按名称 / 描述本地过滤，不请求后端
  const [keyword, setKeyword] = useState('')

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
      toast(`${removed.join('、')} 已售罄或已变更，已移出购物车`, 2500)
    }
  }, [reconcile])

  useDidShow(() => {
    const token = extractQrToken(router.params as Record<string, unknown>) ?? pendingToken
    if (token) {
      setPendingToken(null)
      void loadTable(token)
    } else if (!current) {
      restoreLast()
    } else {
      // 从确认订单页返回或长时间停留后回到前台：刷新营业状态与菜单，购物车按最新菜单对账
      void refreshCurrent(current)
    }
  })

  const refreshCurrent = async (table: NonNullable<typeof current>) => {
    if (table.qrToken) {
      try {
        setCurrent({ ...(await resolveQr(table.qrToken, true)), qrToken: table.qrToken })
        return  // setCurrent 触发下方 effect 重新加载菜单
      } catch {
        // 桌码失效等：保留原状态，下面至少刷新一次菜单
      }
    }
    loadMenu(table.storeId).catch(() => {})
  }

  useEffect(() => {
    if (current) {
      void Taro.setNavigationBarTitle({ title: current.storeName })
      bindStore(current.storeId)
      loadMenu(current.storeId).then(() => setError(null)).catch(() => setError('菜单加载失败，点击重试'))
    }
  }, [current, bindStore, loadMenu])

  const handleScan = async () => {
    try {
      const res = await Taro.scanCode({ onlyFromCamera: true })
      const token = parseTokenFromLink(res.result)
      if (!token) {
        toast('不是本店的桌码')
        return
      }
      void loadTable(token)
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
      toast('多种规格请在购物车中调整')
      return
    }
    changeQty(item.key, -1)
  }

  const renderDish = (d: MenuDish) => {
    const qty = dishQty(items, d.id)
    return (
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
              <Badge value={qty > 0 ? qty : undefined}>
                <Button type='primary' size='small' onClick={() => tapAdd(d)}>选规格</Button>
              </Badge>
            ) : qty > 0 ? (
              <InputNumber value={qty} min={0} max={99} onChange={(v) => (Number(v) > qty ? tapAdd(d) : tapMinus(d))} />
            ) : (
              <Button type='primary' size='small' shape='round' onClick={() => tapAdd(d)}>＋</Button>
            )}
          </View>
        </View>
      </View>
    )
  }

  const trimmedKeyword = keyword.trim().toLowerCase()
  const matchedDishes = trimmedKeyword
    ? (menu?.categories ?? []).flatMap((c) => c.dishes).filter((d) =>
        d.name.toLowerCase().includes(trimmedKeyword) || (d.description ?? '').toLowerCase().includes(trimmedKeyword))
    : []

  // ---------- 未扫码 ----------
  if (!current) {
    return (
      <PageShell>
        <View className='empty-page'>
          <Text className='empty-title'>请扫描桌上的二维码点餐</Text>
          {error && <Text className='warn'>{error}</Text>}
          {isH5 ? (
            <>
              <Text className='h5-intro'>用手机相机或浏览器扫描桌上的二维码即可打开菜单；下单时登录会员账号，从账户余额支付。</Text>
              {loadingTable && <Text className='muted'>正在加载桌台…</Text>}
              {process.env.NODE_ENV === 'development' && <Button type='primary' loading={loadingTable} onClick={() => loadTable('dev-table-a1')}>打开开发桌台 A1</Button>}
            </>
          ) : (
            <Button type='primary' size='large' loading={loadingTable} onClick={handleScan}>扫一扫</Button>
          )}
          <View className='header-links'>
            <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}>我的订单</Text>
            <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>我的账户</Text>
          </View>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <View className='page'>
        <View className='header'>
          <View>
            <Text className='store-name'>{current.storeName}</Text>
            <Text className='table-tag'>桌号 {current.tableCode}</Text>
          </View>
          <View className='header-links'>
            <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })}>我的订单</Text>
            <Text className='link' onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>我的账户</Text>
          </View>
        </View>
        {!current.storeOpen && <View className='closed-tip'><Text>店铺已打烊，暂不能下单</Text></View>}
        {error && (
          <View className='closed-tip' onClick={() => loadMenu(current.storeId).then(() => setError(null)).catch(() => {})}>
            <Text>{error}</Text>
          </View>
        )}

        <SearchBar shape='round' placeholder='搜索菜品' value={keyword} onChange={(v) => setKeyword(v)} onClear={() => setKeyword('')} />

        {trimmedKeyword ? (
          <ScrollView scrollY className='search-result'>
            {matchedDishes.length === 0
              ? <Text className='muted center'>没有找到「{keyword.trim()}」相关菜品</Text>
              : matchedDishes.map(renderDish)}
            <View style={{ height: '200px' }} />
          </ScrollView>
        ) : (
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
                    <Badge value={qty > 0 ? qty : undefined}><Text>{c.name}</Text></Badge>
                  </View>
                )
              })}
            </ScrollView>

            <ScrollView scrollY className='dishes' scrollIntoView={scrollTarget} scrollWithAnimation>
              {menu && menu.categories.length === 0 && <Text className='muted center'>暂无菜品</Text>}
              {menu?.categories.map((c) => (
                <View key={c.id} id={`cat-${c.id}`}>
                  <Text className='cat-title'>{c.name}</Text>
                  {c.dishes.map(renderDish)}
                </View>
              ))}
              <View style={{ height: '200px' }} />
            </ScrollView>
          </View>
        )}

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
    </PageShell>
  )
}
