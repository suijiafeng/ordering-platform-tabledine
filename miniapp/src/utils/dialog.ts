import { Dialog } from '@nutui/nutui-react-taro'
import { DIALOG_ID } from '../components/PageShell'

/** 确认框（NutUI Dialog，页面需用 PageShell 包裹）：resolve true 表示用户点了确定 */
export function confirm(title: string, content: string, confirmText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    Dialog.open(DIALOG_ID, {
      title,
      content,
      confirmText,
      cancelText: '取消',
      onConfirm: () => { resolve(true); Dialog.close(DIALOG_ID) },
      onCancel: () => { resolve(false); Dialog.close(DIALOG_ID) },
    })
  })
}
