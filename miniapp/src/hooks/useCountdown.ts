import { useEffect, useRef, useState } from 'react'

/**
 * 到某个时刻的剩余秒数，每秒刷新一次；到期后停在 0 并触发一次 onExpire。
 * 目标为空时返回 null（不显示倒计时）。页面隐藏时小程序会自动降低定时器频率，这里不额外处理。
 */
export function useCountdown(targetIso: string | null | undefined, onExpire?: () => void): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => remaining(targetIso))
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire

  useEffect(() => {
    const first = remaining(targetIso)
    setSecondsLeft(first)
    if (first == null || first <= 0) {
      return
    }
    const timer = setInterval(() => {
      const left = remaining(targetIso)
      setSecondsLeft(left)
      if (left != null && left <= 0) {
        clearInterval(timer)
        expireRef.current?.()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [targetIso])

  return secondsLeft
}

function remaining(targetIso: string | null | undefined): number | null {
  if (!targetIso) return null
  const ms = new Date(targetIso).getTime() - Date.now()
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : null
}
