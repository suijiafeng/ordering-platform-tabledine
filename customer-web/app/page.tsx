import { Suspense } from 'react'
import { MenuClient } from '@/components/MenuClient'

export default function HomePage() {
  return <Suspense fallback={<div className="empty-state">正在加载…</div>}><MenuClient /></Suspense>
}
