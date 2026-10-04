import { App } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'

/**
 * 给 React 树外的代码（如 utils/request.ts）用的 message。
 * 直接 import { message } from 'antd' 是静态方法，拿不到 ConfigProvider 的主题，深色模式下会弹浅色提示。
 * 由 <AntdStaticBridge /> 在 <App> 内部把带上下文的实例存进来。
 */
let messageApi: MessageInstance | null = null

export function getMessage(): MessageInstance | null {
  return messageApi
}

export function AntdStaticBridge() {
  messageApi = App.useApp().message
  return null
}
