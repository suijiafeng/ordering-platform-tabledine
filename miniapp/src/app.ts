import { PropsWithChildren } from 'react'
import { useDidShow, useLaunch } from '@tarojs/taro'
import { extractQrToken } from './utils/scene'
import { useTableStore } from './store/table'
import './app.css'

/**
 * 启动 / 切回前台时从启动参数中解析桌码（微信 query.q、支付宝 query.qrCode、H5 地址路径）。
 * 登录不在启动时做：浏览菜单不需要登录，提交订单时才要求登录会员账号。
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
  })

  useDidShow((options) => {
    captureScan(options)
  })

  return children
}

export default App
