'use client'

import { useEffect, useState } from 'react'

/**
 * 全局网络异常横幅。navigator.onLine 只能反映「有没有连上网络」，
 * 请求本身失败时由请求层的 toast 负责提示，两者互补。
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="banner banner-fixed" role="status">
      <span className="banner-mark" aria-hidden="true">!</span>
      网络连接失败，请检查后重试
    </div>
  )
}
