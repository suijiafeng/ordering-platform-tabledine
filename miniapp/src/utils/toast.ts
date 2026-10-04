import { Toast } from '@nutui/nutui-react-taro'
import { TOAST_ID } from '../components/PageShell'

/** 轻提示（NutUI Toast，页面需用 PageShell 包裹）。只是展示，调用方不需要等待它完成 */
export function toast(title: string, durationMs = 1500): void {
  Toast.show(TOAST_ID, { content: title, duration: durationMs / 1000 })
}
