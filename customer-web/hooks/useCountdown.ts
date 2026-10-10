'use client'

import { useEffect, useRef, useState } from 'react'

const secondsUntil = (deadline: string | null) =>
  deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)) : null

/** 距 deadline 的剩余秒数（null 表示没有截止时间）；归零时调用一次 onExpire */
export function useCountdown(deadline: string | null, onExpire?: () => void): number | null {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(deadline))
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setSecondsLeft(secondsUntil(deadline))
    if (!deadline) return
    const timer = window.setInterval(() => {
      const next = secondsUntil(deadline)
      setSecondsLeft(next)
      if (next === 0) {
        clearInterval(timer)
        onExpireRef.current?.()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return secondsLeft
}
