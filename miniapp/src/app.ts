import { PropsWithChildren } from 'react'
import { useDidShow, useLaunch } from '@tarojs/taro'
import { ensureLogin } from './utils/auth'
import { extractQrToken } from './utils/scene'
import { useTableStore } from './store/table'
import './app.css'
import { isH5 } from './utils/platform'

/**
 * 启动 / 切回前台时：
 * 1. 从启动参数中解析桌码（微信 query.q、支付宝 query.qrCode）
 * 2. 提前静默登录，后续接口无需等待
 */
function App({ children }: PropsWithChildren) {
  const captureScan = (options?: { query?: Record<string, unknown> }) => {
    const token = extractQrToken(options?.query)
    if (token) {
      useTableStore.getState().setPendingToken(token)
    }
  }

  useLaunch((options) => {
    captureScan(options)
    if (isH5) return // 浏览器只看菜单，不调用小程序登录。
    ensureLogin().catch(() => {
      // 登录失败不阻塞启动，首次调用业务接口时会再次尝试
    })
  })

  useDidShow((options) => {
    captureScan(options)
  })

  return children
}

export default App
