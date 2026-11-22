import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { newOrderCount } from '../api/order'
import type { NewOrderCount } from '../api/types'
import { onLogout, useAuthStore } from '../store/auth'
import { ApiError } from '../utils/request'
import { playSound, useSoundStore } from '../utils/sound'

const REMIND_KEY = 'merchant_remind_interval'
/** 本标签页会话内已经提示过的待处理订单号，刷新页面后仍有效，避免「有 N 单待接单」每次刷新都弹 */
export const SEEN_ORDERS_KEY = 'merchant_poll_seen_orders'

function loadRemind(): number {
  try {
    const v = Number(localStorage.getItem(REMIND_KEY))
    return Number.isFinite(v) && v >= 0 && localStorage.getItem(REMIND_KEY) !== null ? v : 60_000
  } catch {
    return 60_000
  }
}

export function readSeenOrders(): Set<string> | null {
  try {
    const raw = sessionStorage.getItem(SEEN_ORDERS_KEY)
    if (raw == null) return null
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) && arr.every((x) => typeof x === 'string') ? new Set(arr as string[]) : null
  } catch {
    return null
  }
}

export function writeSeenOrders(seen: Set<string> | null) {
  try {
    if (seen == null) sessionStorage.removeItem(SEEN_ORDERS_KEY)
    else sessionStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify([...seen]))
  } catch {
    // 隐私模式等无法写入，退化为仅内存
  }
}

/**
 * 比较本轮待处理订单与已见集合。
 * seen 为 null 表示本会话第一次观察：只建立基线并返回初始数量，不当成「新到单」。
 * 之后只把未见过的单号当作新增。
 */
export function diffPendingOrders(seen: Set<string> | null, pending: string[]): {
  next: Set<string>
  initialCount: number | null
  fresh: string[]
} {
  const next = new Set(pending)
  if (seen == null) {
    return { next, initialCount: pending.length, fresh: [] }
  }
  return { next, initialCount: null, fresh: pending.filter((no) => !seen.has(no)) }
}

interface PollState {
  counts: NewOrderCount | null
  /** 最近一次检测到的新订单数（供页面弹提示），消费后清零 */
  newArrived: number
  /** 首次打开后台时已存在的待接单数（提示一次后清零） */
  initialPending: number
  /** 最近一批新到订单（供全局弹窗）。seq 每批递增，页面以此判断是否是新一批 */
  lastArrival: { seq: number; orderNos: string[] } | null
  /** 未接单持续提醒间隔（毫秒），0 关闭 */
  remindIntervalMs: number
  /** 连续因网络 / 服务不可用失败的轮询次数（全局断线横幅用） */
  netFailures: number
  /** 最近一次轮询成功的时间 */
  lastSyncAt: number | null
  /** 已提醒过的「超时未审核退款」数量（跨布局重新挂载保留，避免重复提醒） */
  overdueNotified: number
  setCounts: (c: NewOrderCount) => void
  setRemindInterval: (ms: number) => void
  consumeNew: () => void
  consumeInitial: () => void
}

export const usePollStore = create<PollState>((set) => ({
  counts: null,
  newArrived: 0,
  initialPending: 0,
  lastArrival: null,
  remindIntervalMs: loadRemind(),
  overdueNotified: 0,
  netFailures: 0,
  lastSyncAt: null,
  setCounts: (counts) => set({ counts }),
  setRemindInterval: (ms) => {
    try {
      localStorage.setItem(REMIND_KEY, String(ms))
    } catch {
      // 忽略
    }
    set({ remindIntervalMs: ms })
  },
  consumeInitial: () => set({ initialPending: 0 }),
  consumeNew: () => set({ newArrived: 0 }),
}))

/**
 * 轮询的记忆放在模块级而不是组件 ref：布局重新挂载（如从打印页返回）时不会把已有订单当成「首次打开」再提醒一遍。
 * 退出登录时由 resetOrderPollMemory 清空，换账号后重新建立基线。
 */
let seenOrderNos: Set<string> | null = readSeenOrders()
let lastRemindAt = 0
/** 本页生命周期内是否已经做过一次基线轮询；刷新后要重新计时，避免立刻响起「未接单持续提醒」 */
let primed = false

export function resetOrderPollMemory() {
  seenOrderNos = null
  lastRemindAt = 0
  primed = false
  writeSeenOrders(null)
  useSoundStore.setState({ blocked: false })
  usePollStore.setState({ counts: null, newArrived: 0, initialPending: 0, lastArrival: null, netFailures: 0, lastSyncAt: null, overdueNotified: 0 })
}

/** 模拟刷新后模块重新加载：从 sessionStorage 恢复已见订单，不把存量单再当成首次打开。 */
export function restoreSeenOrdersFromSession() {
  seenOrderNos = readSeenOrders()
  lastRemindAt = 0
  primed = false
}

onLogout(resetOrderPollMemory)

/**
 * 新订单轮询（MVP：每 5 秒），全局只需在 MainLayout 挂载一次。
 * 返回最新计数；检测到新订单时播放提示音（前厅：新订单；后厨：新制作单）并累加 newArrived。
 */
export function useOrderPoll(intervalMs = 5000) {
  const { counts, setCounts } = usePollStore()
  // 已经提醒过的待接单订单号（模块级 seenOrderNos）。按「当前待接单集合」去重判断新单，而不是按支付时间游标，
  // 不受时钟和并发影响
  // 后端慢于轮询间隔时，不让两次请求重叠
  const inFlight = useRef(false)
  const [error, setError] = useState(false)

  const tick = useCallback(async () => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    try {
      const c = await newOrderCount(null)
      setError(false)
      // 权责分离：前厅 / 店主关心「新支付待接单」；后厨只关心「前厅刚确认、进入制作中」的单
      const isKitchen = useAuthStore.getState().staff?.role === 'KITCHEN'
      const pending = isKitchen ? (c.makingOrderNos ?? []) : (c.pendingOrderNos ?? [])
      const { next, initialCount, fresh } = diffPendingOrders(seenOrderNos, pending)
      seenOrderNos = next
      writeSeenOrders(next)
      if (initialCount != null) {
        // 本会话第一次观察：有存量待处理时只弹一次；刷新后 seen 已写入 sessionStorage，不会再走这里
        if (initialCount > 0) {
          usePollStore.setState({ initialPending: initialCount })
        }
      } else if (fresh.length > 0) {
        usePollStore.setState((s) => ({
          newArrived: s.newArrived + fresh.length,
          lastArrival: { seq: (s.lastArrival?.seq ?? 0) + 1, orderNos: fresh },
        }))
        playSound(isKitchen ? 'kitchenNewOrder' : 'newOrder')
        lastRemindAt = Date.now()
      }
      // 未接单持续提醒：本页第一次轮询只建立起点，避免刷新后立刻再响
      if (!primed) {
        primed = true
        lastRemindAt = Date.now()
      } else {
        const remind = usePollStore.getState().remindIntervalMs
        if (!isKitchen && pending.length > 0 && remind > 0 && useSoundStore.getState().enabled && Date.now() - lastRemindAt >= remind) {
          playSound('remindPending')
          lastRemindAt = Date.now()
        }
      }
      setCounts(c)
      usePollStore.setState({ netFailures: 0, lastSyncAt: Date.now() })
    } catch (e) {
      setError(true)
      // 只有连不上服务器（网络断开 / 5xx）才算断线；业务错误码不触发横幅
      if (e instanceof ApiError && e.code === -1) {
        usePollStore.setState((s) => ({ netFailures: s.netFailures + 1 }))
      }
    } finally {
      inFlight.current = false
    }
  }, [setCounts])

  useEffect(() => {
    void tick()
    // 页面在后台也继续轮询：商家切到别的标签页时仍要能听到新订单提示（浏览器会把后台定时器放慢，但不会停）
    const timer = window.setInterval(() => { void tick() }, intervalMs)
    return () => window.clearInterval(timer)
  }, [tick, intervalMs])

  return { counts, error, retry: tick }
}
