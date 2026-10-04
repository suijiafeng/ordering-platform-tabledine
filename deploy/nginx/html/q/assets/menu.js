/* 匿名菜单只调用公开读取接口；不创建顾客会话、不保存购物车、不发起订单或支付。 */
(() => {
  'use strict'

  const REQUEST_TIMEOUT_MS = 10000
  const QR_INVALID = 40402
  const NOT_FOUND = 40401
  const byId = (id) => document.getElementById(id)
  const state = { categories: [], selectedCategoryId: null, query: '', loading: false }

  class MenuError extends Error {
    constructor(message, code = 0) {
      super(message)
      this.code = code
    }
  }

  async function readApi(path) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(path, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => {
        throw new MenuError('菜单服务暂时不可用，请稍后重试。')
      })
      if (!response.ok || body?.code !== 0) {
        throw new MenuError(body?.message || '菜单加载失败，请稍后重试。', body?.code)
      }
      if (!body.data || typeof body.data !== 'object') {
        throw new MenuError('菜单数据不完整，请稍后重试。')
      }
      return body.data
    } catch (error) {
      if (error instanceof MenuError) {
        throw error
      }
      throw new MenuError(error.name === 'AbortError'
        ? '加载超时，请检查网络后重试。'
        : '网络连接失败，请检查网络后重试。')
    } finally {
      clearTimeout(timeout)
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    // 店铺、菜品和接口错误信息均作为文本渲染，不能拼接成 HTML。
    if (text != null) node.textContent = text
    return node
  }

  function formatPrice(amountInCents) {
    return (amountInCents / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  }

  function priceDeltaLabel(amountInCents) {
    if (!amountInCents) return ''
    return ` ${amountInCents > 0 ? '+' : '−'}¥${formatPrice(Math.abs(amountInCents))}`
  }

  function safeImageUrl(value) {
    if (!value) return null
    try {
      const url = new URL(value, window.location.origin)
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null
    } catch {
      return null // 无效图片地址不影响菜单浏览。
    }
  }

  function renderStore(table, store) {
    const storeName = store?.name || table.storeName
    const isOpen = store?.open ?? table.storeOpen
    document.title = `${storeName} · 店铺菜单`
    byId('store-name').textContent = storeName
    byId('table-code').textContent = `桌号 ${table.tableCode}`
    byId('store-status').textContent = isOpen ? '营业中' : '暂未营业'
    byId('store-status').classList.toggle('closed', !isOpen)
    byId('store-meta').hidden = false
    byId('closed-notice').hidden = isOpen
    const info = byId('store-info')
    info.replaceChildren()
    if (!store) {
      info.append(element('p', '', '店铺详细信息暂未加载，可刷新重试。'))
      return
    }
    for (const [label, value] of [['营业时间', store.businessHours], ['地址', store.address], ['电话', store.phone]]) {
      if (value) info.append(element('p', '', `${label}：${value}`))
    }
  }

  function renderCategories() {
    const nav = byId('categories')
    nav.replaceChildren()
    const categories = [{ id: null, name: '全部' }, ...state.categories]
    for (const category of categories) {
      const button = element('button', 'category-button', category.name)
      button.type = 'button'
      button.setAttribute('aria-pressed', String(category.id === state.selectedCategoryId))
      button.addEventListener('click', () => {
        state.selectedCategoryId = category.id
        for (const item of nav.children) item.setAttribute('aria-pressed', String(item === button))
        renderMenu()
      })
      nav.append(button)
    }
  }

  function renderOptionGroup(group, hint) {
    const section = element('div', 'option-group')
    const heading = element('p', 'option-heading', group.name)
    heading.append(element('span', 'option-hint', hint))
    const items = element('div', 'option-items')
    for (const item of group.items || []) {
      items.append(element('span', 'option-item', `${item.name}${priceDeltaLabel(item.priceDelta)}`))
    }
    section.append(heading, items)
    return section
  }

  function renderDish(dish) {
    const card = element('article', `dish-card${dish.soldOut ? ' is-sold-out' : ''}`)
    const main = element('div', 'dish-main')
    const picture = element('div', 'dish-image')
    const placeholder = element('span', '', '餐')
    placeholder.setAttribute('aria-hidden', 'true')
    picture.append(placeholder)
    const imageUrl = safeImageUrl(dish.image)
    if (imageUrl) {
      const image = element('img')
      image.alt = dish.name
      image.loading = 'lazy'
      image.decoding = 'async'
      image.addEventListener('load', () => { placeholder.hidden = true })
      image.addEventListener('error', () => { image.remove(); placeholder.hidden = false })
      image.src = imageUrl
      picture.append(image)
    }
    const info = element('div', 'dish-info')
    info.append(element('h3', 'dish-name', dish.name))
    if (dish.description) info.append(element('p', 'dish-description', dish.description))
    const priceRow = element('div', 'dish-price-row')
    const price = element('span', 'dish-price', `¥${formatPrice(dish.price)}`)
    const specGroups = dish.specGroups || []
    const addonGroups = dish.addonGroups || []
    if (specGroups.length || addonGroups.length) price.append(element('span', 'price-label', '基础价'))
    priceRow.append(price)
    if (dish.soldOut) priceRow.append(element('span', 'sold-out', '已售罄'))
    info.append(priceRow)
    main.append(picture, info)
    card.append(main)
    if (specGroups.length || addonGroups.length) {
      const options = element('details', 'dish-options')
      options.append(element('summary', '', '查看规格与加料'))
      for (const group of specGroups) {
        options.append(renderOptionGroup(group, group.required ? '必选一项' : '可选一项'))
      }
      for (const group of addonGroups) {
        options.append(renderOptionGroup(group, `最多选 ${group.maxCount} 项`))
      }
      card.append(options)
    }
    return card
  }

  function renderMenu() {
    const list = byId('menu-list')
    list.replaceChildren()
    const query = state.query.trim().toLocaleLowerCase()
    let count = 0
    for (const category of state.categories) {
      if (state.selectedCategoryId !== null && category.id !== state.selectedCategoryId) continue
      const dishes = category.dishes.filter((dish) => `${dish.name} ${dish.description || ''}`.toLocaleLowerCase().includes(query))
      if (!dishes.length) continue
      count += dishes.length
      const section = element('section', 'menu-section')
      section.append(element('h2', 'category-title', category.name))
      const grid = element('div', 'dish-grid')
      for (const dish of dishes) grid.append(renderDish(dish))
      section.append(grid)
      list.append(section)
    }
    byId('result-count').textContent = `${query ? '搜索结果' : '当前展示'} · ${count} 道菜品`
    byId('empty-state').hidden = count > 0
    byId('empty-title').textContent = query ? '没有找到相关菜品' : '菜单正在准备中'
    byId('empty-message').textContent = query ? '试试其他关键词，或切换到「全部」分类。' : '请稍后刷新，或联系店员了解今日供应。'
  }

  function showLoadState(title, message, retryable) {
    byId('load-state').hidden = false
    byId('menu-content').hidden = true
    byId('state-title').textContent = title
    byId('state-message').textContent = message
    byId('retry').hidden = !retryable
  }

  async function loadMenu() {
    if (state.loading) return
    // 保留现有 /q/{token} 桌码协议，不从 query 参数接受任意接口或门店地址。
    const match = /^\/q\/([A-Za-z0-9_-]{1,64})\/?$/.exec(window.location.pathname)
    if (!match) {
      showLoadState('请扫描桌上的二维码', '此链接没有有效桌码，请重新扫码或联系店员。', false)
      return
    }
    state.loading = true
    byId('refresh').disabled = true
    byId('store-meta').hidden = true
    byId('store-info').replaceChildren()
    showLoadState('正在打开菜单', '稍等一下，美味马上呈现。', false)
    try {
      const table = await readApi(`/api/v1/c/qr/${encodeURIComponent(match[1])}`)
      if (!Number.isSafeInteger(table.storeId) || table.storeId < 1) {
        throw new MenuError('桌码信息不完整，请联系店员。', QR_INVALID)
      }
      // 店铺介绍属于辅助信息，失败不应阻止顾客查看菜单。
      const [menu, store] = await Promise.all([
        readApi(`/api/v1/c/stores/${table.storeId}/menu`),
        readApi(`/api/v1/c/stores/${table.storeId}`).catch(() => null),
      ])
      if (!Array.isArray(menu.categories) || menu.categories.some((category) => !Array.isArray(category.dishes))) {
        throw new MenuError('菜单数据不完整，请稍后重试。')
      }
      state.categories = menu.categories
      if (!state.categories.some((category) => category.id === state.selectedCategoryId)) state.selectedCategoryId = null
      renderStore(table, store)
      renderCategories()
      renderMenu()
      byId('load-state').hidden = true
      byId('menu-content').hidden = false
    } catch (error) {
      const invalid = error instanceof MenuError && [QR_INVALID, NOT_FOUND].includes(error.code)
      showLoadState(invalid ? '桌码已失效' : '菜单暂时未能加载',
        invalid ? '请联系店员获取新的桌码，再重新扫码查看菜单。' : error.message || '请稍后重试。', !invalid)
    } finally {
      state.loading = false
      byId('refresh').disabled = false
    }
  }

  byId('search').addEventListener('input', (event) => {
    state.query = event.target.value
    renderMenu()
  })
  byId('retry').addEventListener('click', () => { void loadMenu() })
  byId('refresh').addEventListener('click', () => { void loadMenu() })
  void loadMenu()
})()
