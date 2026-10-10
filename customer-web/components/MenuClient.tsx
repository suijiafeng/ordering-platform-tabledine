'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ApiError, fetchMenu, resolveTable } from '@/lib/api'
import { defaultSelection, hasOptions } from '@/lib/pricing'
import { imageSrc, yuan } from '@/lib/format'
import type { Dish, MenuView, Selection, TableInfo } from '@/lib/types'
import { MAX_QUANTITY, dishLimit, dishQuantity, useOrdering } from '@/store/ordering'
import { notify } from '@/store/feedback'
import { EmptyState, PersonIcon, Price, PillButton, SearchIcon, Skeleton, Stepper, Tile } from './ui'
import { ActiveOrderBanner } from './ActiveOrderBanner'
import { CartBar } from './CartBar'
import { DishDetail } from './DishDetail'
import { SpecSheet } from './SpecSheet'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
/** 回到前台时，距上次加载超过这个时间就静默刷新营业状态与菜单（售罄、下架、打烊） */
const STALE_AFTER_MS = 60_000

/** 桌码来源：?token=xxx。桌码链接 /q/<token> 由 Nginx 302 跳转到 /h5/?token=<token> */
const tokenFromQuery = (value: string | null) => (value && TOKEN_PATTERN.test(value) ? value : null)
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : '加载失败，请稍后重试')

/** 点餐首页：解析桌码 → 菜单（左分类 / 右菜品，滚动联动）→ 规格弹层 → 购物车 */
export function MenuClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { table, items, setTable, clearTable, add, setQuantity, reconcile } = useOrdering()
  const [menu, setMenu] = useState<MenuView | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [specDish, setSpecDish] = useState<Dish | null>(null)
  const [detailDish, setDetailDish] = useState<Dish | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const dishesRef = useRef<HTMLDivElement>(null)
  const scrollingTo = useRef<number | null>(null)
  const scrollStopTimer = useRef<number | undefined>(undefined)
  const loadedAt = useRef(0)

  /** quiet：后台刷新，不显示加载页；失败时保留当前菜单 */
  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) { setLoading(true); setError('') }
    try {
      const queryToken = searchParams.get('token')
      const token = tokenFromQuery(queryToken)
      const current = useOrdering.getState().table
      let resolved: TableInfo | null = null
      if (queryToken && !token) {
        clearTable()
        if (!quiet) setError('桌码无效，请重新扫描桌上的二维码')
        return
      }
      if (token) {
        resolved = await resolveTable(token)
      } else if (current) {
        // 站内跳回菜单（登录页「先逛逛」、退出登录、订单列表「去点餐」）不带桌码：沿用已扫的桌台并重新校验，
        // 不能清空购物车。桌码失效（404）时在下面清掉，要求重新扫码。
        resolved = await resolveTable(current.qrToken)
      } else {
        clearTable()
        setMenu(null)
        setActiveCategory(null)
        return
      }
      setTable(resolved)
      const nextMenu = await fetchMenu(resolved.storeId)
      const { removed, capped } = reconcile(nextMenu)
      setMenu(nextMenu)
      setActiveCategory((value) => value ?? nextMenu.categories[0]?.id ?? null)
      loadedAt.current = Date.now()
      if (removed.length) notify(`${[...new Set(removed)].join('、')} 已售罄或选项有变，已移出购物车`)
      else if (capped.length) notify(`${[...new Set(capped)].join('、')} 剩余不多，购物车数量已调整`)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      if (e.code === 40401 || e.status === 404) clearTable()
      if (quiet) return  // 后台刷新失败不打扰，下次回到前台再试
      setError(e.code === 40401 || e.status === 404 ? '桌码无效，请重新扫描桌上的二维码' : errorText(e))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [searchParams, setTable, clearTable, reconcile])

  useEffect(() => { void load(false) }, [load])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && loadedAt.current && Date.now() - loadedAt.current > STALE_AFTER_MS) void load(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [load])

  useEffect(() => () => { if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current) }, [])

  useEffect(() => { if (table?.storeName) document.title = `${table.storeName} · 扫码点餐` }, [table?.storeName])

  const matched = useMemo(() => {
    const term = keyword.trim().toLowerCase()
    if (!term || !menu) return null
    return menu.categories.flatMap((c) => c.dishes)
      .filter((dish) => dish.name.toLowerCase().includes(term) || dish.description?.toLowerCase().includes(term))
  }, [keyword, menu])

  /** 右侧滚动时高亮当前分类：最后一个顶部已滚过可视区顶端的分类 */
  const syncActiveCategory = () => {
    const container = dishesRef.current
    if (!container || !menu) return
    if (scrollingTo.current !== null) {
      if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current)
      scrollStopTimer.current = window.setTimeout(() => {
        const target = scrollingTo.current
        scrollingTo.current = null
        if (target !== null) setActiveCategory(target)
      }, 120)
      return
    }
    const containerTop = container.getBoundingClientRect().top
    let current = menu.categories[0]?.id ?? null
    for (const category of menu.categories) {
      const section = document.getElementById(`cat-${category.id}`)
      if (section && section.getBoundingClientRect().top - containerTop <= 24) current = category.id
    }
    setActiveCategory(current)
  }

  const scrollToCategory = (categoryId: number) => {
    const container = dishesRef.current
    const section = document.getElementById(`cat-${categoryId}`)
    if (!section || !container) return
    scrollingTo.current = categoryId
    setActiveCategory(categoryId)
    if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current)
    scrollStopTimer.current = window.setTimeout(() => { scrollingTo.current = null }, 700)
    container.scrollTo({ top: container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top, behavior: 'smooth' })
  }

  /** 加入购物车并提示；限量菜达到上限时说明剩余份数 */
  const addToCart = (dish: Dish, selection: Selection = defaultSelection(dish), quantity = 1) => {
    const added = add(dish, selection, quantity)
    if (added === quantity) notify('已加入购物车', 'success')
    else if (added > 0) notify(`「${dish.name}」今日仅剩 ${dishLimit(dish)} 份，已加入 ${added} 份`)
    else notify(`「${dish.name}」今日仅剩 ${dishLimit(dish)} 份，购物车已达上限`)
  }

  const addDish = (dish: Dish) => { if (hasOptions(dish)) setSpecDish(dish); else addToCart(dish) }

  const changeDirectQuantity = (dish: Dish, value: number) => {
    const item = items.find((i) => i.dishId === dish.id)
    if (item) setQuantity(item.key, value)
  }

  const goAccount = () => router.push(table ? `/me?token=${encodeURIComponent(table.qrToken)}` : '/me')
  /** 顶栏里是头像圆钮（省地方，长店名也不会把它挤变形）；白底空状态页用文字按钮 */
  const accountButton = (onWhite?: boolean) => (
    onWhite
      ? <button className="mini-btn" onClick={goAccount}>我的</button>
      : <button className="menu-avatar" aria-label="我的" onClick={goAccount}><PersonIcon /></button>
  )

  const dishRow = (dish: Dish) => {
    const quantity = dishQuantity(items, dish.id)
    const limited = dish.remainingStock != null && dish.remainingStock > 0 && dish.remainingStock <= 10
    let action: React.ReactNode
    if (dish.soldOut) {
      action = <span className="t-note">已售罄</span>
    } else if (hasOptions(dish)) {
      action = <PillButton size="sm" onClick={() => addDish(dish)}>选规格</PillButton>
    } else {
      action = (
        <Stepper
          value={quantity}
          min={0}
          max={dishLimit(dish)}
          hideMinusAtMin
          onChange={(value) => (quantity ? changeDirectQuantity(dish, value) : addDish(dish))}
        />
      )
    }
    return (
      <article className={`dish ${dish.soldOut ? 'off' : ''}`.trim()} key={dish.id}>
        <button className="dish-tile" aria-label={`查看${dish.name}详情`} onClick={() => setDetailDish(dish)}>
          <Tile name={dish.name} image={dish.image ? imageSrc(dish.image) : null} className="dish-tile-inner" />
        </button>
        <div className="dish-main">
          <div className="dish-name" onClick={() => setDetailDish(dish)}>{dish.name}</div>
          {dish.description && <div className="dish-desc" onClick={() => setDetailDish(dish)}>{dish.description}</div>}
          <div className="dish-foot">
            <span>
              <Price value={yuan(dish.price)} suffix={hasOptions(dish) ? '起' : undefined} />
              {limited && <span className="stock-tip">仅剩 {dish.remainingStock} 份</span>}
            </span>
            {action}
          </div>
        </div>
      </article>
    )
  }

  if (loading) return <div className="screen on-white"><Skeleton rows={5} label="菜品加载中…" /></div>
  if (error) {
    return (
      <div className="screen on-white">
        <EmptyState icon="!" title="菜单加载失败" desc={error} action={<>
          <PillButton onClick={() => void load(false)}>重新加载</PillButton>
        </>} />
        <div className="center">{accountButton(true)}</div>
      </div>
    )
  }
  if (!table) {
    return (
      <div className="center-state full">
        <span className="login-mark" style={{ margin: 0 }}>餐</span>
        <div className="t-hero">请扫描桌上的二维码点餐</div>
        <div className="t-note">用手机相机或浏览器扫码即可打开菜单；下单时登录会员账号，从余额支付。</div>
        {process.env.NODE_ENV === 'development' && (
          <PillButton onClick={() => router.replace('/?token=dev-table-a1')}>打开开发桌台 A1</PillButton>
        )}
        {accountButton(true)}
      </div>
    )
  }

  return (
    <div className="menu">
      <header className="menu-hero">
        <div className="menu-hero-row">
          <div>
            <div className="menu-store">{table.storeName}</div>
            <div className="menu-table">{table.tableCode}桌 · 堂食</div>
          </div>
          {accountButton()}
        </div>
        <div className="search-field">
          <SearchIcon />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索菜品" aria-label="搜索菜品" />
        </div>
      </header>
      {!table.storeOpen && <div className="menu-closed">店铺已打烊，当前可以浏览菜单，暂不能下单</div>}
      <ActiveOrderBanner />

      {matched ? (
        <div className="dishes" style={{ flex: 1, minHeight: 0 }}>
          {matched.length ? matched.map(dishRow) : <EmptyState inset title="没有找到相关菜品" desc={`试试换个词，当前搜索「${keyword.trim()}」`} />}
        </div>
      ) : (
        <div className="menu-body">
          <nav className="cats">
            {menu?.categories.map((category) => {
              const count = category.dishes.reduce((sum, dish) => sum + dishQuantity(items, dish.id), 0)
              return (
                <button
                  key={category.id}
                  className={`cat ${activeCategory === category.id ? 'on' : ''}`.trim()}
                  aria-current={activeCategory === category.id ? 'true' : undefined}
                  onClick={() => scrollToCategory(category.id)}
                >
                  <span className="cat-label">{category.name}</span>
                  {count > 0 && <span className="cat-badge" aria-label={`已选 ${count} 份`}>{count}</span>}
                </button>
              )
            })}
          </nav>
          <div className="dishes" ref={dishesRef} onScroll={syncActiveCategory}>
            {menu && menu.categories.length === 0 && <EmptyState inset title="暂无菜品" desc="店家还没有上架菜品" />}
            {menu?.categories.map((category) => (
              <section id={`cat-${category.id}`} key={category.id}>
                <h2 className="cat-head">{category.name}</h2>
                {category.dishes.map(dishRow)}
              </section>
            ))}
          </div>
        </div>
      )}

      <CartBar disabled={!table.storeOpen} />
      <DishDetail dish={detailDish} onClose={() => setDetailDish(null)} onAdd={(dish) => { setDetailDish(null); addDish(dish) }} />
      <SpecSheet
        dish={specDish}
        maxQuantity={specDish ? dishLimit(specDish) - dishQuantity(items, specDish.id) : MAX_QUANTITY}
        onClose={() => setSpecDish(null)}
        onConfirm={(dish, selection, quantity) => { addToCart(dish, selection, quantity); setSpecDish(null) }}
      />
    </div>
  )
}
