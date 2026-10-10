'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMe } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'

/** 余额仅用于结算提示，最终校验仍由支付接口完成；刷新失败时不沿用旧余额。 */
export function useMemberBalance(enabled: boolean) {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestSeq = useRef(0)
  const invalidate = useCallback(() => { requestSeq.current++ }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return
    const seq = ++requestSeq.current
    setLoading(true)
    setFailed(false)
    try {
      const profile = await fetchMe()
      if (seq === requestSeq.current) setBalance(profile.balance)
    } catch (e) {
      if (seq === requestSeq.current) { setBalance(null); setFailed(true) }
      ignoreShownError(e)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) { setBalance(null); setFailed(false); setLoading(false); return }
    void refresh()
    const onVisibility = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      invalidate()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, refresh, invalidate])

  return { balance, loading, failed, refresh }
}
