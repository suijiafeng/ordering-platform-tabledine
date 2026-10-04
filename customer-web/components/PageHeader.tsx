'use client'

import { NavBar } from 'antd-mobile'
import { useRouter } from 'next/navigation'
import { currentRoutePath } from '@/lib/navigation'

/** 本次打开网页时落地的地址（扫码、分享链接、刷新）；整页加载才会重新计算 */
const landingUrl = typeof window === 'undefined' ? '' : currentRoutePath()

/**
 * 页面顶栏。落地页没有站内的上一页，返回时改为进入 fallback，不会退出到浏览器空白页。
 */
export function PageHeader({ children, fallback = '/' }: { children: React.ReactNode; fallback?: string }) {
  const router = useRouter()
  const back = () => {
    if (currentRoutePath() === landingUrl) router.replace(fallback)
    else router.back()
  }
  return <NavBar className="page-header" onBack={back}>{children}</NavBar>
}
