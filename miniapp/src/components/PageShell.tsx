import type { PropsWithChildren } from 'react'
import { ConfigProvider, Dialog, Toast } from '@nutui/nutui-react-taro'

export const TOAST_ID = 'app-toast'
export const DIALOG_ID = 'app-dialog'

/** NutUI 主题：与 app.css 色板一致（品牌橙 / 价格暖橙 / 语义色 / 文字灰） */
const THEME: Record<string, string> = {
  nutuiColorPrimary: '#ff6a00',
  nutuiColorPrimaryStop1: '#ff6a00',
  nutuiColorPrimaryStop2: '#f24d12',
  nutuiColorPrimaryPressed: '#e65f00',
  nutuiColorPrimaryLightPressed: '#fff3e8',
  nutuiColorDanger: '#e5484d',
  nutuiColorSuccess: '#2ba94f',
  nutuiColorTitle: '#222222',
  nutuiColorText: '#222222',
  nutuiColorTextHelp: '#999999',
  nutuiColorBorder: '#eeeeee',
  nutuiPriceColor: '#f24d12',
  nutuiButtonPrimaryBorderColor: '#ff6a00',
  nutuiSearchbarContentBackground: '#f5f5f5',
  nutuiInputnumberIconColor: '#ff6a00',
  nutuiSidebarActiveColor: '#ff6a00',
}

/**
 * 每个页面的根容器：注入 NutUI 主题，并挂载本页的 Toast / Dialog（Taro 端命令式调用需要页面内存在对应组件）。
 */
export default function PageShell({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={THEME}>
      {children}
      <Toast id={TOAST_ID} />
      <Dialog id={DIALOG_ID} />
    </ConfigProvider>
  )
}
