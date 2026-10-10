'use client'

import { useFeedback } from '@/store/feedback'

/**
 * 全局轻提示：居中黑色胶囊，成功与普通提示同一种样式（设计稿只有一种 toast）。
 * aria-live 容器常驻，读屏才能播报后来插入的内容。
 */
export function Feedback() {
  const { message, hide } = useFeedback()
  return (
    <div aria-live="polite" role="status">
      {message && <button className="toast" onClick={hide}>{message}</button>}
    </div>
  )
}
