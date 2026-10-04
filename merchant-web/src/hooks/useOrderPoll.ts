import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { newOrderCount } from '../api/order'
import type { NewOrderCount } from '../api/types'

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
  /** 未接单持续提醒间隔（毫秒），0 关闭 */
  remindIntervalMs: number
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
  remindIntervalMs: loadRemind(),
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

/** 提示音：Web Audio 合成两声短促的「叮咚」，不依赖音频文件 */
export function playNewOrderSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
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
    beep(880, 0, 0.25)
    beep(1175, 0.28, 0.35)
    setTimeout(() => ctx.close().catch(() => {}), 1200)
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
  // 已经提醒过的待接单订单号。按「当前待接单集合」去重判断新单，而不是按支付时间游标：
  // 顾客 12:00 付款、回调 12:02 才到时，游标已过 12:01，按时间会漏掉提示音
  const seenRef = useRef<Set<string> | null>(null)
  const lastRemindRef = useRef(0)
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
      if (seenRef.current === null) {
        // 首次打开后台：不播放新单音，但明确告知已有待处理订单
        seenRef.current = new Set(pending)
        if (pending.length > 0) {
          usePollStore.setState({ initialPending: pending.length })
        }
      } else {
        const seen = seenRef.current
        const fresh = pending.filter((no) => !seen.has(no))
        if (fresh.length > 0) {
          fresh.forEach((no) => seen.add(no))
          usePollStore.setState((s) => ({ newArrived: s.newArrived + fresh.length }))
          if (usePollStore.getState().soundEnabled) {
            playNewOrderSound()
            lastRemindRef.current = Date.now()
          }
        }
        // 集合只保留仍在待接单的订单，已接单的从记忆中移除（订单号不会复用，去掉只是防止无限增长）
        for (const no of Array.from(seen)) {
          if (!pending.includes(no)) seen.delete(no)
        }
        // 未接单持续提醒：仍有待接单且距上次提醒超过间隔，再响一次
        const remind = usePollStore.getState().remindIntervalMs
        if (pending.length > 0 && remind > 0 && usePollStore.getState().soundEnabled && Date.now() - lastRemindRef.current >= remind) {
          playNewOrderSound()
          lastRemindRef.current = Date.now()
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void tick()
      }
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [tick, intervalMs])

  return { counts, error, soundEnabled }
}
