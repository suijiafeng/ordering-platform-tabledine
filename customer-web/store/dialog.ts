'use client'

import { create } from 'zustand'

export interface DialogRequest {
  title: string
  content?: string
  /** 主按钮文案 */
  confirmText: string
  /** 次按钮文案；省略则是单按钮弹窗（只有「知道了」这类确认） */
  cancelText?: string
}

interface DialogState {
  request: (DialogRequest & { id: number }) | null
  resolve: ((ok: boolean) => void) | null
  open: (request: DialogRequest) => Promise<boolean>
  close: (ok: boolean) => void
}

let nextId = 0

/**
 * 命令式弹窗的状态：页面在 async 流程里 await open()，由 <DialogHost /> 渲染。
 * 同一时刻只保留最后一个请求，前一个按「取消」结算，避免 Promise 悬挂。
 */
export const useDialog = create<DialogState>((set, get) => ({
  request: null,
  resolve: null,
  open: (request) => new Promise<boolean>((resolve) => {
    get().resolve?.(false)
    set({ request: { ...request, id: ++nextId }, resolve })
  }),
  close: (ok) => {
    get().resolve?.(ok)
    set({ request: null, resolve: null })
  },
}))
