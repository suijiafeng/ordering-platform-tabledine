import type { Metadata, Viewport } from 'next'
import 'antd-mobile/es/global'
import './globals.css'

export const metadata: Metadata = { title: '扫码点餐', description: '门店自助点餐' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f5562b' }

/** 简化版布局：全局反馈组件随基础组件提交补全 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><main className="app-shell">{children}</main></body></html>
}
