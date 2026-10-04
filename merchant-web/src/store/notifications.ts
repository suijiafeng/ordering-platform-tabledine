import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { onLogout } from './auth'

export type MerchantMessageKind = 'ORDER' | 'REFUND' | 'SYSTEM'

export interface MerchantMessage {
  id: string
  kind: MerchantMessageKind
  title: string
  description: string
  createdAt: number
  link?: string
  dedupeKey?: string
  read: boolean
}

interface NotificationState {
  messages: MerchantMessage[]
  add: (message: Omit<MerchantMessage, 'id' | 'createdAt' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

/** crypto.randomUUID 只在 HTTPS / localhost 下可用（局域网 http 访问会抛错），这里退化为时间戳 + 随机数 */
function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export const useNotificationStore = create<NotificationState>()(persist((set) => ({
  messages: [],
  add: (message) => set((state) => message.dedupeKey && state.messages.some((item) => item.dedupeKey === message.dedupeKey)
    ? state
    : { messages: [{ ...message, id: newId(), createdAt: Date.now(), read: false }, ...state.messages].slice(0, 100) }),
  markRead: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, read: true } : item) })),
  markAllRead: () => set((state) => ({ messages: state.messages.map((item) => item.read ? item : { ...item, read: true }) })),
  clear: () => set({ messages: [] }),
}), {
  name: 'merchant-message-center',
  storage: createJSONStorage(() => localStorage),
}))

// 消息中心属于当前登录账号：退出登录即清空，换账号（如店主交给店员）不会看到上一个人的消息
onLogout(() => useNotificationStore.getState().clear())
