import type { Metadata, Viewport } from 'next'
import 'antd-mobile/es/global'
import './globals.css'
import { Feedback } from '@/components/Feedback'
import { AntdMobileCompat } from '@/components/AntdMobileCompat'
import { DialogHost } from '@/components/DialogHost'
import { OfflineBanner } from '@/components/OfflineBanner'

export const metadata: Metadata = { title: '扫码点餐', description: '门店自助点餐' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f5562b' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><main className="app-shell"><AntdMobileCompat /><OfflineBanner />{children}<Feedback /><DialogHost /></main></body></html>
}
