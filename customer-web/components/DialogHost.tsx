'use client'

import { useEffect } from 'react'
import { useDialog } from '@/store/dialog'
import { PillButton } from './ui'

/**
 * 全局弹窗宿主，挂在 layout 里。样式按设计稿：居中白卡、17px 加粗标题、13px 灰说明，
 * 单按钮时整行主色按钮，双按钮时左描边右主色。
 */
export function DialogHost() {
  const { request, close } = useDialog()

  // 打开期间禁止背景滚动，并支持返回键 / Esc 关闭
  useEffect(() => {
    if (!request) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [request, close])

  if (!request) return null
  const single = !request.cancelText
  return (
    <div className="dialog-mask" role="dialog" aria-modal="true" aria-label={request.title} onClick={() => close(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{request.title}</div>
        {request.content && <div className="dialog-desc">{request.content}</div>}
        <div className={`dialog-acts ${single ? 'single' : ''}`.trim()}>
          {!single && <PillButton className="grow" variant="plain" onClick={() => close(false)}>{request.cancelText}</PillButton>}
          <PillButton className="grow" onClick={() => close(true)}>{request.confirmText}</PillButton>
        </div>
      </div>
    </div>
  )
}
