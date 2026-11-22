import type { MouseEvent, ReactNode } from 'react'
import { App, Button, type ButtonProps } from 'antd'

interface Props extends Omit<ButtonProps, 'onClick' | 'children'> {
  children: ReactNode
  /** 确认框标题，如「确认接单？」 */
  confirmText: ReactNode
  /** 在确认框里点确认才执行 */
  onConfirm: () => void
}

/**
 * 订单操作的确认：点一次弹出确认框，框一直留着，直到点确认或取消。
 * 以前是按钮上「再点一次」，大约两三秒就自己恢复，手慢一点等于没点；
 * 订单详情还会每几秒刷新并把按钮拆掉，待确认状态跟着丢。确认框挂在页面外层，刷新拆不掉。
 */
export default function ConfirmButton({ children, confirmText, onConfirm, ...rest }: Props) {
  const { modal } = App.useApp()

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    modal.confirm({
      title: confirmText,
      okText: '确认',
      cancelText: '取消',
      onOk: () => onConfirm(),
    })
  }

  return (
    <Button {...rest} onClick={handleClick}>
      {children}
    </Button>
  )
}
