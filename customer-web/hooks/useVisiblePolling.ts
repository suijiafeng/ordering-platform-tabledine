'use client'

import { useCallback, useEffect, useRef } from 'react'

export interface PollContext {
  /** 后台同步不应清空旧内容、闪动加载态或重复弹网络提示。 */
  background: boolean
  /** 新一轮刷新、隐藏页面或卸载后，旧响应不能回写。 */
  isCurrent: () => boolean
}

interface Options {
  enabled?: boolean
  intervalMs?: number
  resetKey?: string
}

/** 同一页面的数据请求串行执行；慢请求完成后再计时，手动刷新合并为下一轮。 */
export function useVisiblePolling(load: (context: PollContext) => Promise<void>, {
  enabled = true, intervalMs = 5000, resetKey,
}: Options = {}) {
  const latest = useRef(load)
  latest.current = load
  const identity = useRef({ enabled, resetKey })
  identity.current = { enabled, resetKey }
  const trigger = useRef<() => Promise<void>>(() => Promise.resolve())
  // StrictMode 重挂 effect、切换查询标识时也等待上一代请求结束。
  const pending = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let sequence = 0
    let timer: number | undefined
    let running: Promise<void> | null = null
    let queued = false
    let queuedBackground = true

    const run = (background: boolean): Promise<void> => {
      window.clearTimeout(timer)
      if (!active || document.hidden) return Promise.resolve()
      if (running) {
        sequence++
        queued = true
        queuedBackground = queuedBackground && background
        return running
      }
      const previous = pending.current
      running = (async () => {
        if (previous) await previous
        if (!active || document.hidden) return
        let quiet = background
        do {
          queued = false
          queuedBackground = true
          const mine = ++sequence
          await latest.current({
            background: quiet,
            isCurrent: () => active && mine === sequence && identity.current.enabled && identity.current.resetKey === resetKey,
          })
          quiet = queuedBackground
        } while (active && queued && !document.hidden)
      })().catch((error: unknown) => {
        // API 失败由各 loader 展示可恢复状态；非 API 异常仍记录，避免浮动 Promise。
        console.error('页面数据同步失败', error)
      }).finally(() => {
        running = null
        if (active && !document.hidden) timer = window.setTimeout(() => { void run(true) }, intervalMs)
      })
      pending.current = running
      return running
    }

    trigger.current = () => run(false)
    const resume = () => { if (!document.hidden) void run(true) }
    const onVisibility = () => {
      window.clearTimeout(timer)
      if (document.hidden) { sequence++; queued = false }
      else resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    void run(false)
    return () => {
      active = false
      sequence++
      queued = false
      window.clearTimeout(timer)
      trigger.current = () => Promise.resolve()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [enabled, intervalMs, resetKey])

  return useCallback(() => trigger.current(), [])
}
