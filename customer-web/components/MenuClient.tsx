'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, ErrorBlock, SearchBar, SpinLoading, Stepper } from 'antd-mobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { ApiError, fetchMenu, resolveTable } from '@/lib/api'
import { defaultSelection, hasOptions } from '@/lib/pricing'
import { imageSrc, yuan } from '@/lib/format'
import type { Dish, MenuView, TableInfo } from '@/lib/types'
import { MAX_QUANTITY, dishLimit, dishQuantity, useOrdering } from '@/store/ordering'
import { notify } from '@/store/feedback'
import { ActiveOrderBanner } from './ActiveOrderBanner'
import { CartBar } from './CartBar'
import { DishDetail } from './DishDetail'
import { SpecSheet } from './SpecSheet'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
/** 回到前台时，距上次加载超过这个时间就静默刷新营业状态与菜单（售罄、下架、打烊） */
const STALE_AFTER_MS = 60_000

/** 桌码来源：?token=xxx。桌码链接 /q/<token> 由 Nginx 302 跳转到 /h5/?token=<token> */
function tokenFromLocation(queryToken: string | null): string | null {
  return queryToken && TOKEN_PATTERN.test(queryToken) ? queryToken : null
}

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
  const dishesRef = useRef<HTMLElement>(null)
  const scrollingToCategory = useRef<number | null>(null)
  const scrollStopTimer = useRef<number | undefined>(undefined)
  const loadedAt = useRef(0)

  /** quiet：后台刷新，不显示加载页；失败时保留当前菜单 */
  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) {
      setLoading(true)
      setError('')
    }
    try {
      const queryToken = searchParams.get('token')
      const token = tokenFromLocation(queryToken)
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
      if (!resolved) return
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

  useEffect(() => {
    if (table?.storeName) document.title = `${table.storeName} · 扫码点餐`
  }, [table?.storeName])

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
    if (scrollingToCategory.current !== null) {
      if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current)
      scrollStopTimer.current = window.setTimeout(() => {
        const target = scrollingToCategory.current
        scrollingToCategory.current = null
        if (target !== null) setActiveCategory(target)
      }, 120)
      return
    }
    const containerTop = container.getBoundingClientRect().top
    let current = menu.categories[0]?.id ?? null
    for (const category of menu.categories) {
      const section = document.getElementById(`category-${category.id}`)
      if (section && section.getBoundingClientRect().top - containerTop <= 24) current = category.id
    }
    setActiveCategory(current)
  }

  const scrollToCategory = (categoryId: number) => {
    const container = dishesRef.current
    const section = document.getElementById(`category-${categoryId}`)
    if (!section || !container) return
    scrollingToCategory.current = categoryId
    setActiveCategory(categoryId)
    if (scrollStopTimer.current) window.clearTimeout(scrollStopTimer.current)
    scrollStopTimer.current = window.setTimeout(() => { scrollingToCategory.current = null }, 700)
    const top = container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top, behavior: 'smooth' })
  }

  /** 加入购物车并提示；限量菜达到上限时说明剩余份数 */
  const addToCart = (dish: Dish, selection = defaultSelection(dish), quantity = 1) => {
    const added = add(dish, selection, quantity)
    if (added === quantity) notify('已加入购物车', 'success')
    else if (added > 0) notify(`「${dish.name}」今日仅剩 ${dishLimit(dish)} 份，已加入 ${added} 份`)
    else notify(`「${dish.name}」今日仅剩 ${dishLimit(dish)} 份，购物车已达上限`)
    return added
  }

  const addDish = (dish: Dish) => {
    if (hasOptions(dish)) setSpecDish(dish)
    else addToCart(dish)
  }

  /** 列表里的「仅剩 N 份」角标：限量且剩余不多时才显示，避免菜单到处都是数字 */
  const stockHint = (dish: Dish) =>
    dish.remainingStock != null && dish.remainingStock > 0 && dish.remainingStock <= 10
      ? <span className="stock-hint">仅剩 {dish.remainingStock} 份</span>
      : null

  const changeDirectQuantity = (dish: Dish, value: number) => {
    const item = items.find((i) => i.dishId === dish.id)
    if (item) setQuantity(item.key, value)
  }

  const dishView = (dish: Dish) => {
    const quantity = dishQuantity(items, dish.id)
    let action: React.ReactNode
    if (dish.soldOut) {
      action = <span className="muted">已售罄</span>
    } else if (hasOptions(dish)) {
      action = (
        <Badge content={quantity || null}>
          <Button size="mini" color="primary" shape="rounded" onClick={() => addDish(dish)}>选规格</Button>
        </Badge>
      )
    } else if (quantity) {
      action = <Stepper min={0} max={dishLimit(dish)} value={quantity} onChange={(value) => changeDirectQuantity(dish, value)} />
    } else {
      action = <button className="round-add" aria-label={`添加${dish.name}`} onClick={() => addDish(dish)}>+</button>
    }
    return (
      <div className={`dish ${dish.soldOut ? 'sold-out' : ''}`} key={dish.id}>
        <button className="dish-media" aria-label={`查看${dish.name}详情`} onClick={() => setDetailDish(dish)}>
          {dish.image
            ? <img className="dish-image" src={imageSrc(dish.image)} alt="" loading="lazy" />
            : <div className="dish-placeholder" />}
        </button>
        <div className="dish-info">
          <div className="dish-name" onClick={() => setDetailDish(dish)}>{dish.name}</div>
          {dish.description && <div className="dish-desc" onClick={() => setDetailDish(dish)}>{dish.description}</div>}
          <div className="dish-bottom">
            <span className="price">¥{yuan(dish.price)}{hasOptions(dish) && <small>起</small>}{stockHint(dish)}</span>
            {action}
          </div>
        </div>
      </div>
    )
  }

  const accountLinks = (
    <div className="top-links">
      <button className="soft-link" onClick={() => router.push(table ? `/me?token=${encodeURIComponent(table.qrToken)}` : '/me')}>我的账户</button>
    </div>
  )

  if (loading) {
    return (
      <div className="empty-state">
        <SpinLoading color="primary" />
        <div className="muted">正在加载桌台和菜单…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="empty-state">
        <ErrorBlock status="disconnected" title="菜单加载失败" description={error} />
        <Button color="primary" onClick={() => void load(false)}>重新加载</Button>
        {accountLinks}
      </div>
    )
  }
  if (!table) {
    return (
      <div className="empty-state">
        <div className="brand-mark">餐</div>
        <h1>请扫描桌上的二维码点餐</h1>
        <p className="muted">用手机相机或浏览器扫码即可打开菜单；下单时登录会员账号，从账户余额支付。</p>
        {process.env.NODE_ENV === 'development' && (
          <Button color="primary" onClick={() => router.replace('/?token=dev-table-a1')}>打开开发桌台 A1</Button>
        )}
        {accountLinks}
      </div>
    )
  }

  return (
    <div className="menu-page">
      <header className="topbar">
        <div>
          <h1 className="store-name">{table.storeName}</h1>
          <span className="table-pill">桌号 {table.tableCode}</span>
        </div>
        {accountLinks}
      </header>
      {!table.storeOpen && <div className="notice">店铺已打烊，当前可以浏览菜单，暂不能下单</div>}
      <ActiveOrderBanner />
      <div className="search-wrap">
        <SearchBar placeholder="搜索菜品" value={keyword} onChange={setKeyword} onClear={() => setKeyword('')} />
      </div>

      {matched ? (
        <section className="dishes search-result">
          {matched.length
            ? matched.map(dishView)
            : <ErrorBlock status="empty" title={`没有找到「${keyword.trim()}」相关菜品`} description="" />}
        </section>
      ) : (
        <div className="menu-layout">
          <nav className="categories">
            {menu?.categories.map((category) => {
              const count = category.dishes.reduce((sum, dish) => sum + dishQuantity(items, dish.id), 0)
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`category ${activeCategory === category.id ? 'active' : ''}`}
                  aria-current={activeCategory === category.id ? 'true' : undefined}
                  onClick={() => scrollToCategory(category.id)}
                >
                  {category.name}
                  {count > 0 && <span className="category-count" aria-label={`已选 ${count} 份`}>{count}</span>}
                </button>
              )
            })}
          </nav>
          <section className="dishes" ref={dishesRef} onScroll={syncActiveCategory}>
            {menu && menu.categories.length === 0 && <ErrorBlock status="empty" title="暂无菜品" description="" />}
            {menu?.categories.map((category) => (
              <div id={`category-${category.id}`} key={category.id}>
                <h2 className="category-title">{category.name}</h2>
                {category.dishes.map(dishView)}
              </div>
            ))}
          </section>
        </div>
      )}

      <CartBar disabled={!table.storeOpen} />
      <DishDetail dish={detailDish} onClose={() => setDetailDish(null)} onAdd={(dish) => { setDetailDish(null); addDish(dish) }} />
      <SpecSheet
        dish={specDish}
        maxQuantity={specDish ? dishLimit(specDish) - dishQuantity(items, specDish.id) : MAX_QUANTITY}
        onClose={() => setSpecDish(null)}
        onConfirm={(dish, selection, quantity) => {
          addToCart(dish, selection, quantity)
          setSpecDish(null)
        }}
      />
    </div>
  )
}
