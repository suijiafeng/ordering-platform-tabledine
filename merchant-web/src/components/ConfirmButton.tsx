import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Button, type ButtonProps } from 'antd'

interface Props extends Omit<ButtonProps, 'onClick' | 'children'> {
  children: ReactNode
  /** 第一次点击后按钮上显示的确认文案，如「再点一次确认出餐」 */
  confirmText: ReactNode
  /** 第二次点击才执行 */
  onConfirm: () => void
  /** 等待第二次点击的时间，超时恢复原状 */
  timeoutMs?: number
}

/**
 * 按钮内二次确认：第一次点击进入待确认状态（按钮变色、文案变为确认提示），时限内再点一次才执行。
 * 用于接单 / 开始制作 / 出餐 / 送达这类高频但不可撤回的操作：防误触，又不像弹窗那样打断节奏。
 */
export default function ConfirmButton({ children, confirmText, onConfirm, timeoutMs = 3000, danger, style, ...rest }: Props) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setArmed(false), timeoutMs)
      return
    }
    window.clearTimeout(timer.current)
    setArmed(false)
    onConfirm()
  }

  return (
    <Button
      {...rest}
      danger={armed || danger}
      // 待确认时用描边红色，和普通状态明显区分；屏幕阅读器也能读到提示
      aria-live="polite"
      style={armed ? { ...style, background: undefined } : style}
      onClick={handleClick}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmText : children}
    </Button>
  )
}
