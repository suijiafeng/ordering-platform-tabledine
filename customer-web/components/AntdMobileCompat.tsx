'use client'

import { unstableSetRender } from 'antd-mobile'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Next.js App Router 运行在自带的 React 19 上，antd-mobile v5 的命令式弹层（Dialog.confirm、Toast 等）
 * 默认用的 ReactDOM.render 已被移除，弹不出来。按官方兼容说明改用 createRoot。
 * https://mobile.ant.design/guide/v5-for-19
 */
type Container = (Element | DocumentFragment) & { __antdMobileRoot?: Root }

if (typeof window !== 'undefined') {
  unstableSetRender((node, container: Container) => {
    container.__antdMobileRoot ??= createRoot(container)
    const root = container.__antdMobileRoot
    root.render(node)
    return async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      root.unmount()
      delete container.__antdMobileRoot
    }
  })
}

export function AntdMobileCompat() {
  return null
}
