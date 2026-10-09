'use client'

import { useFeedback } from '@/store/feedback'

/** 全局轻提示。aria-live 容器常驻，读屏才能播报后来插入的内容 */
export function Feedback() {
  const { message, kind, hide } = useFeedback()
  return (
    <div aria-live="polite" role="status">
      {message && <button className={`feedback ${kind}`} onClick={hide}>{kind === 'success' ? '✓ ' : ''}{message}</button>}
    </div>
  )
}
