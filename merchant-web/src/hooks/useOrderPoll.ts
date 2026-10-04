import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { newOrderCount } from '../api/order'
import type { NewOrderCount } from '../api/types'
import { onLogout } from '../store/auth'

const SOUND_KEY = 'merchant_sound_enabled'
const REMIND_KEY = 'merchant_remind_interval'

function loadRemind(): number {
  try {
    const v = Number(localStorage.getItem(REMIND_KEY))
    return Number.isFinite(v) && v >= 0 && localStorage.getItem(REMIND_KEY) !== null ? v : 60_000
  } catch {
    return 60_000
  }
}

interface PollState {
  counts: NewOrderCount | null
  soundEnabled: boolean
  /** 最近一次检测到的新订单数（供页面弹提示），消费后清零 */
  newArrived: number
  /** 首次打开后台时已存在的待接单数（提示一次后清零） */
  initialPending: number
  /** 最近一批新到订单（供全局弹窗）。seq 每批递增，页面以此判断是否是新一批 */
  lastArrival: { seq: number; orderNos: string[] } | null
  /** 未接单持续提醒间隔（毫秒），0 关闭 */
  remindIntervalMs: number
  /** 提示音被浏览器自动播放策略拦截（需要用户点一下页面） */
  soundBlocked: boolean
  /** 已提醒过的「超时未审核退款」数量（跨布局重新挂载保留，避免重复提醒） */
  overdueNotified: number
  setCounts: (c: NewOrderCount) => void
  setSoundEnabled: (v: boolean) => void
  setRemindInterval: (ms: number) => void
  consumeNew: () => void
  consumeInitial: () => void
}

function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'
  } catch {
    return true
  }
}

export const usePollStore = create<PollState>((set) => ({
  counts: null,
  soundEnabled: loadSound(),
  newArrived: 0,
  initialPending: 0,
  lastArrival: null,
  remindIntervalMs: loadRemind(),
  soundBlocked: false,
  overdueNotified: 0,
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
  setSoundEnabled: (v) => {
    try {
      localStorage.setItem(SOUND_KEY, v ? '1' : '0')
    } catch {
      // 忽略
    }
    set({ soundEnabled: v })
  },
  consumeNew: () => set({ newArrived: 0 }),
}))

/**
 * 轮询的记忆放在模块级而不是组件 ref：布局重新挂载（如从打印页返回）时不会把已有订单当成「首次打开」再提醒一遍。
 * 退出登录时由 resetOrderPollMemory 清空，换账号后重新建立基线。
 */
let seenOrderNos: Set<string> | null = null
let lastRemindAt = 0

export function resetOrderPollMemory() {
  seenOrderNos = null
  lastRemindAt = 0
  usePollStore.setState({ counts: null, newArrived: 0, initialPending: 0, lastArrival: null, soundBlocked: false })
}

onLogout(resetOrderPollMemory)

let audioCtx: AudioContext | null = null

/** 复用同一个 AudioContext；浏览器自动播放策略下它可能处于 suspended，需要用户点一下页面才能恢复 */
function audioContext(): AudioContext {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctx()
  }
  return audioCtx
}

/** 用户任意一次点击 / 按键后尝试恢复音频（浏览器只允许在用户手势里恢复） */
export function unlockSound() {
  try {
    const ctx = audioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => usePollStore.setState({ soundBlocked: false })).catch(() => {})
    } else {
      usePollStore.setState({ soundBlocked: false })
    }
  } catch {
    // 浏览器不支持 Web Audio
  }
}

/** 提示音：Web Audio 合成一声短提示，不依赖音频文件。被自动播放策略拦截时标记 soundBlocked，页面提示用户点一下启用 */
export function playNewOrderSound() {
  try {
    const ctx = audioContext()
    if (ctx.state === 'suspended') {
      usePollStore.setState({ soundBlocked: true })
      void ctx.resume().catch(() => {})
    }
    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }
    beep(1046, 0, 0.35)
  } catch {
    // 浏览器不支持或被自动播放策略拦截
  }
}

/**
 * 新订单轮询（MVP：每 5 秒），全局只需在 MainLayout 挂载一次。
 * 返回最新计数；检测到新支付订单时播放提示音并累加 newArrived。
 */
export function useOrderPoll(intervalMs = 5000) {
  const { counts, setCounts, soundEnabled } = usePollStore()
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
      const pending = c.pendingOrderNos ?? []
      if (seenOrderNos === null) {
        // 首次打开后台：不播放新单音，但明确告知已有待处理订单
        seenOrderNos = new Set(pending)
        if (pending.length > 0) {
          usePollStore.setState({ initialPending: pending.length })
        }
      } else {
        const seen = seenOrderNos
        const fresh = pending.filter((no) => !seen.has(no))
        if (fresh.length > 0) {
          fresh.forEach((no) => seen.add(no))
          usePollStore.setState((s) => ({
            newArrived: s.newArrived + fresh.length,
            lastArrival: { seq: (s.lastArrival?.seq ?? 0) + 1, orderNos: fresh },
          }))
          if (usePollStore.getState().soundEnabled) {
            playNewOrderSound()
            lastRemindAt = Date.now()
          }
        }
        // 集合只保留仍在待接单的订单，已接单的从记忆中移除（订单号不会复用，去掉只是防止无限增长）
        for (const no of Array.from(seen)) {
          if (!pending.includes(no)) seen.delete(no)
        }
        // 未接单持续提醒：仍有待接单且距上次提醒超过间隔，再响一次
        const remind = usePollStore.getState().remindIntervalMs
        if (pending.length > 0 && remind > 0 && usePollStore.getState().soundEnabled && Date.now() - lastRemindAt >= remind) {
          playNewOrderSound()
          lastRemindAt = Date.now()
        }
      }
      setCounts(c)
    } catch {
      setError(true)
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

  return { counts, error, soundEnabled }
}
