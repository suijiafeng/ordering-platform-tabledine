import { useEffect, useRef } from 'react'

interface Options {
  enabled?: boolean
  intervalMs?: number
}

/**
 * 可见页面的后台同步：初次加载由页面负责，之后每 5 秒刷新。
 * 慢请求串行执行；返回标签页、窗口重新聚焦或网络恢复时立即同步。
 * 回调变化不会重建计时器，也不会打断正在编辑的页面状态。
 */
export function useVisiblePolling(callback: () => Promise<void>, { enabled = true, intervalMs = 5000 }: Options = {}) {
  const latestCallback = useRef(callback)
  latestCallback.current = callback

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let running = false
    let timer: number | undefined

    const schedule = () => {
      if (!stopped && document.visibilityState === 'visible') {
        timer = window.setTimeout(() => { void poll() }, intervalMs)
      }
    }

    const poll = async () => {
      if (stopped || running || document.visibilityState !== 'visible') return
      running = true
      try {
        // 页面请求自行处理 API 错误；finally 保证失败后仍会安排下一次同步。
        await latestCallback.current()
      } finally {
        running = false
        schedule()
      }
    }

    const resume = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'visible') void poll()
    }

    schedule()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [enabled, intervalMs])
}
