import { create } from 'zustand'

/** 订单在页面外（新订单横幅等）被操作后递增，订单列表据此静默刷新 */
export const useOrderEvents = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}))
