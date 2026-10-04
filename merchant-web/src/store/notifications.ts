import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

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

export const useNotificationStore = create<NotificationState>()(persist((set) => ({
  messages: [],
  add: (message) => set((state) => message.dedupeKey && state.messages.some((item) => item.dedupeKey === message.dedupeKey)
    ? state
    : { messages: [{ ...message, id: crypto.randomUUID(), createdAt: Date.now(), read: false }, ...state.messages].slice(0, 100) }),
  markRead: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, read: true } : item) })),
  markAllRead: () => set((state) => ({ messages: state.messages.map((item) => item.read ? item : { ...item, read: true }) })),
  clear: () => set({ messages: [] }),
}), {
  name: 'merchant-message-center',
  storage: createJSONStorage(() => localStorage),
}))
