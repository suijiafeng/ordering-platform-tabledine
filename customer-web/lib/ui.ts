export function getAppShell() {
  return document.querySelector<HTMLElement>('.app-shell') ?? document.body
}

/** 确认对话框；返回用户是否确认 */
export async function confirmDialog(title: string, content: string, confirmText = '确认'): Promise<boolean> {
  const { Dialog } = await import('antd-mobile')
  return Dialog.confirm({ title, content, confirmText, cancelText: '再想想' })
}
