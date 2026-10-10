import { test, expect, type Page } from '@playwright/test'
import type { Dish, OrderDetail, TableInfo } from '../lib/types'

const table: TableInfo = { storeId: 1, storeName: '小满食堂', storeOpen: true, tableId: 1, tableCode: 'A08', qrToken: 'demo-table' }
const dish = (id: number, name: string, price: number, extra: Partial<Dish> = {}): Dish => ({
  id, name, description: '现点现做，家常好滋味', price, image: null, soldOut: false,
  remainingStock: null, specGroups: [], addonGroups: [], ...extra,
})
const menu = { storeId: 1, categories: [
  { id: 1, name: '招牌热菜', dishes: [dish(1, '招牌红烧肉', 3800, { remainingStock: 8 }), dish(2, '砂锅番茄牛腩', 4800, { specGroups: [{ id: 1, name: '口味', required: true, items: [{ id: 1, name: '原味', priceDelta: 0, isDefault: true }, { id: 2, name: '微辣', priceDelta: 0 }] }] }), dish(3, '香煎黄花鱼', 4200, { soldOut: true })] },
  { id: 2, name: '时令蔬菜', dishes: [dish(4, '蒜蓉时蔬', 1800), dish(5, '清炒山药木耳', 2200)] },
  { id: 3, name: '米饭饮品', dishes: [dish(6, '五常米饭', 300), dish(7, '桂花酸梅汤', 800)] },
] }

function makeOrder(status: OrderDetail['status'] = 'PENDING_PAY', amount = 3800): OrderDetail {
  return { id: 1, orderNo: 'UX202610110001', status, refundStatus: 'NONE', tableCode: table.tableCode,
    storeName: table.storeName, totalAmount: amount, payAmount: amount, refundedAmount: 0,
    itemCount: 1, items: [{ id: 1, dishId: 1, dishName: '招牌红烧肉', dishImage: null, specDesc: null, addonDesc: null, unitPrice: amount, quantity: 1, totalPrice: amount, refundedQty: 0 }],
    createdAt: new Date().toISOString(), payExpireAt: new Date(Date.now() + 900_000).toISOString(),
    peopleCount: 1, remark: null, refundableAmount: 0, paidAt: status === 'PAID' ? new Date().toISOString() : null,
    cancelReason: null, refunds: [], canCancel: true, canApplyRefund: false, logs: [],
  }
}

async function setup(page: Page, options: { authenticated?: boolean; cart?: boolean; status?: OrderDetail['status']; storeOpen?: boolean } = {}) {
  const state = { balance: 10000, balanceFailure: false, orderFailure: false, price: 3800, order: makeOrder(options.status), created: [] as Record<string, unknown>[], paid: 0 }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ table, authenticated, cart }) => {
    // 保留跨导航中的真实修改，避免测试注入覆盖登录、购物车清空等行为。
    if (sessionStorage.getItem('ux-fixture')) return
    sessionStorage.setItem('ux-fixture', 'yes')
    localStorage.setItem('ordering-customer-state', JSON.stringify({ version: 0, state: { table, items: cart ? [{ key: '1||', dishId: 1, name: '招牌红烧肉', image: null, specItemIds: [], addonItemIds: [], specDesc: '', addonDesc: '', unitPrice: 3800, quantity: 1, limit: 8 }] : [] } }))
    if (authenticated) {
      localStorage.setItem('customer_token', 'test-only-token')
      localStorage.setItem('customer_token_expire_at', String(Date.now() + 3600000))
    }
  }, { table: { ...table, storeOpen: options.storeOpen ?? true }, authenticated: options.authenticated ?? true, cart: options.cart ?? false })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let data: unknown
    if (path.includes('/qr/')) data = { ...table, storeOpen: options.storeOpen ?? true }
    else if (path.endsWith('/menu')) data = menu
    else if (path.endsWith('/password-login')) data = { token: 'test-only-token', expiresIn: 3600 }
    else if (path.endsWith('/me')) {
      if (state.balanceFailure) { await route.fulfill({ status: 503, json: { code: 50001, message: '暂时不可用' } }); return }
      data = { id: 1, nickname: '测试会员', phone: '13800000001', member: true, balance: state.balance }
    } else if (path === '/api/v1/c/orders' && method === 'POST') {
      state.created.push(route.request().postDataJSON() as Record<string, unknown>)
      state.order = makeOrder('PENDING_PAY', state.price)
      data = state.order
    } else if (path.endsWith('/pay')) {
      state.paid++
      state.order = { ...state.order, status: 'PAID', paidAt: new Date().toISOString() }
      data = { orderNo: state.order.orderNo, outTradeNo: state.order.orderNo, amount: state.order.payAmount, params: { balance: true, paid: true } }
    } else if (path === `/api/v1/c/orders/${state.order.orderNo}`) {
      if (state.orderFailure) { await route.fulfill({ status: 503, json: { code: 50001, message: '暂时不可用' } }); return }
      data = state.order
    } else if (path === '/api/v1/c/orders') data = { list: [], total: 0, page: 1, pageSize: 5 }
    else throw new Error(`Unexpected fixture API: ${method} ${path}`)
    await route.fulfill({ json: { code: 0, message: 'ok', data } })
  })
  return { state, errors }
}

for (const width of [320, 375, 430, 768]) {
  test(`菜单在 ${width}px 可加菜、搜索、关闭购物车且不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    const { errors } = await setup(page)
    await page.goto('/h5/?token=demo-table')
    await expect(page.getByRole('button', { name: /会员余额支付/ })).toBeVisible()
    const add = page.locator('.dishes').getByRole('button', { name: '增加招牌红烧肉', exact: true })
    await add.click()
    expect(await add.evaluate(el => [el.clientWidth, el.clientHeight])).toEqual([44, 44])
    const cart = page.getByRole('button', { name: '查看购物车，已选 1 件' })
    await cart.click()
    await expect(cart).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: '关闭购物车' }).click()
    await expect(cart).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('searchbox', { name: '搜索菜品' }).fill('不存在的菜')
    await expect(page.getByText('没有找到相关菜品', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '清空搜索' }).click()
    await expect(add).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const overflow = await page.locator('.dishes').evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.getByRole('button', { name: '米饭饮品', exact: true }).click()
    await expect(page.getByRole('button', { name: '增加桂花酸梅汤' })).toBeInViewport()
    const bounds = await page.getByRole('button', { name: '增加桂花酸梅汤' }).boundingBox()
    const footer = await page.locator('.cart-bar').boundingBox()
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y)
    expect(errors).toEqual([])
  })
}

test('规格有明确关闭入口且保留选中语义', async ({ page }) => {
  await setup(page)
  await page.goto('/h5/?token=demo-table')
  await page.getByRole('button', { name: '选规格', exact: true }).click()
  await expect(page.getByRole('button', { name: '原味', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '微辣', exact: true }).click()
  await expect(page.getByRole('button', { name: '微辣', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '关闭规格选择' }).click()
  await expect(page.getByRole('button', { name: '关闭规格选择' })).not.toBeVisible()
})

test('登录返回结算保留草稿；再次确认才创建订单和支付', async ({ page }) => {
  const { state, errors } = await setup(page, { authenticated: false, cart: true })
  await page.goto('/h5/checkout/')
  await page.getByLabel('口味备注').fill('少盐，不放葱')
  await page.getByRole('button', { name: '增加就餐人数' }).click()
  await page.getByRole('button', { name: '登录后确认' }).click()
  await page.getByLabel('手机号', { exact: true }).fill('13800000001')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('口味备注')).toHaveValue('少盐，不放葱')
  await expect(page.getByText('本次支付 ¥38，预计剩余 ¥62')).toBeVisible()
  expect(state.created).toHaveLength(0)
  await page.getByRole('button', { name: '确认并支付', exact: true }).click()
  await expect(page.getByRole('heading', { name: '支付成功', exact: true })).toBeVisible()
  await expect(page.getByText('待商家接单', { exact: true })).toBeVisible()
  expect(state.created).toHaveLength(1)
  expect(state.created[0]).toMatchObject({ peopleCount: 2, remark: '少盐，不放葱' })
  expect(state.paid).toBe(1)
  expect(errors).toEqual([])
})

test('余额不足先充值刷新，不创建占库存的订单', async ({ page }) => {
  const { state } = await setup(page, { cart: true })
  state.balance = 1000
  await page.goto('/h5/checkout/')
  await expect(page.getByText('还差 ¥28，请联系店员充值后刷新余额。')).toBeVisible()
  expect(state.created).toHaveLength(0)
  state.balance = 10000
  await page.locator('.bottom-bar').getByRole('button', { name: '刷新余额', exact: true }).click()
  await expect(page.getByText('本次支付 ¥38，预计剩余 ¥62')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认并支付', exact: true })).toBeEnabled()
  expect(state.created).toHaveLength(0)
})

test('余额刷新失败展示可恢复提示，重试后恢复', async ({ page }) => {
  const { state } = await setup(page, { cart: true })
  state.balanceFailure = true
  await page.goto('/h5/checkout/')
  await expect(page.getByText(/暂时无法查询余额/)).toBeVisible()
  state.balanceFailure = false
  await page.getByRole('button', { name: '刷新余额', exact: true }).click()
  await expect(page.getByText('本次支付 ¥38，预计剩余 ¥62')).toBeVisible()
})

test('提交后菜价变化时不自动支付，跳到收银台核对', async ({ page }) => {
  const { state } = await setup(page, { cart: true })
  state.price = 4200
  await page.goto('/h5/checkout/')
  await page.getByRole('button', { name: '确认并支付', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认支付 ¥42', exact: true })).toBeVisible()
  expect(state.created).toHaveLength(1)
  expect(state.paid).toBe(0)
})

test('支付结果查询失败不假报成功，重新查询可恢复', async ({ page }) => {
  const { state } = await setup(page, { status: 'PAID' })
  state.orderFailure = true
  await page.goto('/h5/paid/?orderNo=UX202610110001')
  await expect(page.getByText('暂时无法确认支付结果', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '支付成功', exact: true })).toHaveCount(0)
  state.orderFailure = false
  await page.getByRole('button', { name: '重新查询', exact: true }).click()
  await expect(page.getByRole('heading', { name: '支付成功', exact: true })).toBeVisible()
  expect(state.paid).toBe(0)
})

for (const status of ['PENDING_PAY', 'CANCELLED', 'CLOSED'] as const) {
  test(`结果页对 ${status} 不显示支付成功`, async ({ page }) => {
    await setup(page, { status })
    await page.goto('/h5/paid/?orderNo=UX202610110001')
    await expect(page.locator('.empty-title')).toHaveText(status === 'PENDING_PAY' ? '订单尚未支付' : status === 'CANCELLED' ? '已取消' : '已关闭')
    await expect(page.getByRole('heading', { name: '支付成功', exact: true })).toHaveCount(0)
  })
}

test('待接单订单点亮已支付进度，收银台可刷新余额', async ({ page }) => {
  const { state } = await setup(page, { status: 'PAID' })
  await page.goto('/h5/order/?orderNo=UX202610110001')
  await expect(page.locator('.step[aria-current="step"]')).toHaveText('已支付')
  state.order = makeOrder()
  state.balance = 1000
  await page.reload()
  await expect(page.getByRole('button', { name: '充值后刷新余额' })).toBeVisible()
  state.balance = 10000
  await page.getByRole('button', { name: '充值后刷新余额' }).click()
  await expect(page.getByRole('button', { name: '确认支付 ¥38' })).toBeVisible()
  expect(state.paid).toBe(0)
})

test('打烊时结算不能创建订单', async ({ page }) => {
  const { state } = await setup(page, { cart: true, storeOpen: false })
  await page.goto('/h5/checkout/')
  await expect(page.getByRole('button', { name: '已打烊' })).toBeDisabled()
  expect(state.created).toHaveLength(0)
})
