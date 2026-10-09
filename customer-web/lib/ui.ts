export function getAppShell() {
  return document.querySelector<HTMLElement>('.app-shell') ?? document.body
}

/** 复制文本到剪贴板；旧内核或非 HTTPS 环境没有 clipboard API 时退回 execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走降级方案
  }
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(input)
  return ok
}

/** 确认对话框；返回用户是否确认 */
export async function confirmDialog(title: string, content: string, confirmText = '确认'): Promise<boolean> {
  const { Dialog } = await import('antd-mobile')
  return Dialog.confirm({ title, content, confirmText, cancelText: '再想想' })
}
