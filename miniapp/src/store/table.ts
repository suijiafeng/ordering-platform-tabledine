import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { QrResolveView } from '../api/types'

const LAST_TABLE_KEY = 'last_table'
/** 未重新扫码时，沿用上次桌台的最长时间 */
const LAST_TABLE_TTL_MS = 3 * 60 * 60 * 1000

interface TableState {
  /** 启动参数里解析出、尚未处理的桌码 */
  pendingToken: string | null
  /** 当前桌台 */
  current: QrResolveView | null
  setPendingToken: (token: string | null) => void
  setCurrent: (table: QrResolveView) => void
  restoreLast: () => QrResolveView | null
}

export const useTableStore = create<TableState>((set) => ({
  pendingToken: null,
  current: null,
  setPendingToken: (token) => set({ pendingToken: token }),
  setCurrent: (table) => {
    Taro.setStorageSync(LAST_TABLE_KEY, { table, savedAt: Date.now() })
    set({ current: table })
  },
  restoreLast: () => {
    const saved = Taro.getStorageSync<{ table: QrResolveView; savedAt: number }>(LAST_TABLE_KEY)
    if (saved && saved.table && Date.now() - saved.savedAt < LAST_TABLE_TTL_MS) {
      set({ current: saved.table })
      return saved.table
    }
    return null
  },
}))
