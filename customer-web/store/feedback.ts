'use client'

import { create } from 'zustand'

interface FeedbackState { message: string; kind: 'info' | 'success'; show: (message: string, kind?: 'info' | 'success') => void; hide: () => void }
let timer: ReturnType<typeof setTimeout> | undefined

export const useFeedback = create<FeedbackState>((set) => ({
  message: '', kind: 'info',
  show: (message, kind = 'info') => {
    clearTimeout(timer)
    set({ message, kind })
    // 成功提示更短，避免从登录回到结算时还盖在价格上
    timer = setTimeout(() => set({ message: '' }), kind === 'success' ? 1400 : 2200)
  },
  hide: () => set({ message: '' }),
}))

export const notify = (message: string, kind: 'info' | 'success' = 'info') => useFeedback.getState().show(message, kind)
