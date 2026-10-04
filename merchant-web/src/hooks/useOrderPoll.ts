import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { newOrderCount } from '../api/order'
import type { NewOrderCount } from '../api/types'

const SOUND_KEY = 'merchant_sound_enabled'

interface PollState {
  counts: NewOrderCount | null
  soundEnabled: boolean
  /** 最近一次检测到的新订单数（供页面弹提示），消费后清零 */
  newArrived: number
  setCounts: (c: NewOrderCount) => void
  setSoundEnabled: (v: boolean) => void
  consumeNew: () => void
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
  setCounts: (counts) => set({ counts }),
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
  const sinceRef = useRef<string | null>(null)
  // 后端慢于轮询间隔时，不让两次请求重叠：否则同一批新订单会被计数 / 提示两次，since 也可能被旧响应回拨
  const inFlight = useRef(false)
  const [error, setError] = useState(false)

  const tick = useCallback(async () => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    try {
      const c = await newOrderCount(sinceRef.current)
      setError(false)
      // 首次轮询只记录时间基准，不提示历史订单
      if (sinceRef.current && c.newPaidCount > 0) {
        usePollStore.setState((s) => ({ newArrived: s.newArrived + c.newPaidCount }))
        if (usePollStore.getState().soundEnabled) {
          playNewOrderSound()
        }
      }
      sinceRef.current = c.serverTime
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
