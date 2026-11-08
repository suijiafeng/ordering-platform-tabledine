'use client'

import { useEffect, useState } from 'react'
import { fetchMe } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { useVisiblePolling } from './useVisiblePolling'

/** 余额自动同步但不作为最终扣款依据；失败保留旧显示并显式标记。 */
export function useMemberBalance(enabled: boolean) {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const refresh = useVisiblePolling(async ({ background, isCurrent }) => {
    if (!background) setLoading(true)
    try {
      const profile = await fetchMe()
      if (isCurrent()) { setBalance(profile.balance); setFailed(false) }
    } catch (e) {
      if (isCurrent()) setFailed(true)
      ignoreShownError(e)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, { enabled })

  useEffect(() => {
    if (!enabled) { setBalance(null); setFailed(false); setLoading(false) }
  }, [enabled])

  return { balance, loading, failed, refresh }
}
