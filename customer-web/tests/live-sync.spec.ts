import { test, expect, type Page } from '@playwright/test'
import type { MenuView, OrderDetail, WalletTransaction } from '../lib/types'

const table = { storeId: 1, storeName: '同步餐厅', storeOpen: true, tableId: 1, tableCode: 'S1', qrToken: 'sync-table' }
const order = (n: number): OrderDetail => ({ id: n, orderNo: `SYNC${n}`, status: 'DONE', refundStatus: 'NONE', tableCode: 'S1', storeName: table.storeName, totalAmount: 1000, payAmount: 1000, refundedAmount: 0, itemCount: 1, items: [{ id: n, dishId: 1, dishName: '同步套餐', dishImage: null, specDesc: null, addonDesc: null, unitPrice: 1000, quantity: 1, totalPrice: 1000, refundedQty: 0 }], createdAt: new Date().toISOString(), payExpireAt: null, peopleCount: 1, remark: null, refundableAmount: 1000, paidAt: new Date().toISOString(), cancelReason: null, refunds: [], canCancel: false, canApplyRefund: true, logs: [] })
const flow = (n: number): WalletTransaction => ({ id: n, type: 'RECHARGE', credit: true, amount: 100, balanceAfter: 10000, outTradeNo: null, remark: `流水${n}`, createdAt: new Date().toISOString() })

async function setup(page: Page, cart = false) {
  const menu: MenuView = { storeId: 1, categories: [{ id: 1, name: '套餐', dishes: [
    { id: 1, name: '同步套餐', description: null, price: 1000, image: null, soldOut: false, remainingStock: null, specGroups: [], addonGroups: [] },
    { id: 2, name: '同步奶茶', description: null, price: 1200, image: null, soldOut: false, remainingStock: null, specGroups: [{ id: 1, name: '杯型', required: true, items: [{ id: 1, name: '中杯', priceDelta: 0, isDefault: true }] }], addonGroups: [] },
  ] }] }
  const state = { order: order(1), balance: 10000, storeOpen: true, failure: false, orders: Array.from({ length: 22 }, (_, i) => order(22 - i)), wallet: Array.from({ length: 22 }, (_, i) => flow(22 - i)), menu, calls: [] as string[], delayedProfile: null as Promise<void> | null }
  await page.clock.install()
  await page.addInitScript(({ table, cart }) => {
    if (sessionStorage.getItem('sync-fixture')) return
    sessionStorage.setItem('sync-fixture', 'yes')
    localStorage.setItem('customer_token', 'sync-test-only')
    localStorage.setItem('customer_token_expire_at', String(Date.now() + 3600000))
    localStorage.setItem('ordering-customer-state', JSON.stringify({ version: 0, state: { table, items: cart ? [{ key: '1||', dishId: 1, name: '同步套餐', image: null, specItemIds: [], addonItemIds: [], specDesc: '', addonDesc: '', unitPrice: 1000, quantity: 1 }] : [] } }))
  }, { table, cart })
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    state.calls.push(url.pathname + url.search)
    if (state.failure) { await route.fulfill({ status: 503, json: { code: 50000, message: '暂时不可用' } }); return }
    let data: unknown
    if (url.pathname.includes('/qr/')) data = { ...table, storeOpen: state.storeOpen }
    else if (url.pathname.endsWith('/menu')) data = state.menu
    else if (url.pathname.endsWith('/me')) { if (state.delayedProfile) await state.delayedProfile; data = { id: 1, nickname: '同步会员', phone: '13800000001', member: true, balance: state.balance } }
    else if (url.pathname.endsWith('/orders') || url.pathname.endsWith('/wallet/transactions')) {
      const pageNo = Number(url.searchParams.get('page') || 1)
      const list = url.pathname.endsWith('/orders') ? state.orders : state.wallet
      data = { list: list.slice((pageNo - 1) * 20, pageNo * 20), total: list.length, page: pageNo, pageSize: 20 }
    } else if (url.pathname.includes('/orders/')) data = state.order
    else throw new Error(`未知测试请求：${url.pathname}`)
    await route.fulfill({ json: { code: 0, message: 'ok', data } })
  })
  return state
}
const tick = (page: Page) => page.clock.runFor(5100)

test('完成单持续同步商家退款，失败保留订单并自动恢复', async ({ page }) => {
  const s = await setup(page)
  await page.goto('/h5/order/?orderNo=SYNC1')
  await expect(page.locator('.status-card .title')).toHaveText('已完成')
  s.failure = true
  await tick(page)
  await expect(page.getByText('网络不稳定，订单状态可能不是最新', { exact: true })).toBeVisible()
  await expect(page.locator('.status-card .title')).toHaveText('已完成')
  s.failure = false
  s.order.refunds = [{ refundNo: 'SYNC-R1', amount: 100, reason: '商家主动退款同步', status: 'SUCCESS', rejectReason: null, failReason: null, createdAt: new Date().toISOString(), items: [] }]
  await tick(page)
  await expect(page.getByText('原因：商家主动退款同步', { exact: true })).toBeVisible()
  await expect(page.getByText('网络不稳定，订单状态可能不是最新', { exact: true })).toHaveCount(0)
})

test('账户慢请求串行，隐藏暂停，回前台立即同步充值', async ({ page }) => {
  const s = await setup(page)
  let release = () => {}
  s.delayedProfile = new Promise<void>((resolve) => { release = resolve })
  await page.goto('/h5/me/')
  await expect.poll(() => s.calls.filter((x) => x.endsWith('/me')).length).toBe(1)
  await page.clock.runFor(6000)
  expect(s.calls.filter((x) => x.endsWith('/me'))).toHaveLength(1)
  release(); s.delayedProfile = null
  await expect(page.locator('.wallet-card .value')).toHaveText('¥100')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  const count = s.calls.length
  s.balance = 12500
  await tick(page)
  expect(s.calls).toHaveLength(count)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.locator('.wallet-card .value')).toHaveText('¥125')
})

test('订单两页同步头部新单，保留原末项和筛选，失败保留内容', async ({ page }) => {
  const s = await setup(page)
  await page.goto('/h5/orders/')
  await expect(page.locator('.order-card')).toHaveCount(20)
  await page.locator('.order-card').last().scrollIntoViewIfNeeded()
  await expect(page.locator('.order-card')).toHaveCount(22)
  await page.getByRole('button', { name: '已结束', exact: true }).click()
  s.orders.unshift(order(23))
  await tick(page)
  await expect(page.locator('.order-card')).toHaveCount(23)
  await expect(page.getByText('订单号：SYNC1', { exact: true })).toBeAttached()
  await expect(page.getByRole('button', { name: '已结束', exact: true })).toHaveClass(/on/)
  s.failure = true
  await tick(page)
  await expect(page.getByText('订单暂未更新，正在自动重试…', { exact: true })).toBeVisible()
  await expect(page.locator('.order-card')).toHaveCount(23)
})

test('钱包两页新增充值同步后无重复且保留旧流水', async ({ page }) => {
  const s = await setup(page)
  await page.goto('/h5/wallet/')
  await expect(page.locator('.flow-row')).toHaveCount(20)
  await page.locator('.flow-row').last().scrollIntoViewIfNeeded()
  await expect(page.locator('.flow-row')).toHaveCount(22)
  s.wallet.unshift({ ...flow(23), remark: '新充值同步' })
  await tick(page)
  await expect(page.locator('.flow-row')).toHaveCount(23)
  await expect(page.getByText('充值 · 新充值同步', { exact: true })).toBeAttached()
  await expect(page.getByText('充值 · 流水1', { exact: true })).toBeAttached()
})

test('菜单搜索购物车保留，打开的规格弹层同步价格库存', async ({ page }) => {
  const s = await setup(page)
  await page.goto('/h5/?token=sync-table')
  await page.getByRole('button', { name: '增加同步套餐', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索菜品' }).fill('同步奶茶')
  await page.getByRole('button', { name: '选规格', exact: true }).click()
  s.menu.categories[0].dishes[0].price = 1500
  s.menu.categories[0].dishes[1].price = 1500
  s.menu.categories[0].dishes[1].remainingStock = 1
  await tick(page)
  await expect(page.getByRole('searchbox', { name: '搜索菜品' })).toHaveValue('同步奶茶')
  await expect(page.getByRole('button', { name: '加入购物车 · ¥15', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '增加数量', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ordering-customer-state')!).state.items[0].unitPrice)).toBe(1500)
})

test('结算自动同步充值和营业，保留输入内容且恢复无需刷新', async ({ page }) => {
  const s = await setup(page, true)
  await page.goto('/h5/checkout/')
  await page.getByLabel('口味备注').fill('同步时保留备注')
  await page.getByRole('button', { name: '增加就餐人数', exact: true }).click()
  s.balance = 20000; s.storeOpen = false
  await tick(page)
  await expect(page.getByText('本次支付 ¥10，预计剩余 ¥190', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '已打烊', exact: true })).toBeDisabled()
  await expect(page.getByLabel('口味备注')).toHaveValue('同步时保留备注')
  s.storeOpen = true
  await tick(page)
  await expect(page.getByRole('button', { name: '确认并支付', exact: true })).toBeEnabled()
})

test('联网和聚焦立即恢复失败的账户同步，隐藏时不请求', async ({ page }) => {
  const s = await setup(page)
  await page.goto('/h5/me/')
  await expect(page.locator('.wallet-card .value')).toHaveText('¥100')
  s.failure = true
  await tick(page)
  await expect(page.getByText('账户信息暂未更新，正在自动重试…', { exact: true })).toBeVisible()
  await expect(page.locator('.wallet-card .value')).toHaveText('¥100')
  s.failure = false
  s.balance = 15000
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.wallet-card .value')).toHaveText('¥150')
  s.balance = 17500
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.wallet-card .value')).toHaveText('¥175')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  const count = s.calls.length
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) })
  await page.clock.runFor(100)
  expect(s.calls).toHaveLength(count)
})
