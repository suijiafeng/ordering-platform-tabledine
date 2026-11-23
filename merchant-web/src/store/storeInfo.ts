import { create } from 'zustand'
import { fetchStore } from '../api/store'
import type { StoreDetail } from '../api/types'
import { onLogout } from './auth'

interface StoreInfoState {
  store: StoreDetail | null
  /** 重新拉取店铺信息（侧栏店铺状态用）；失败时保留旧值，不打扰用户 */
  refresh: () => Promise<void>
  set: (store: StoreDetail) => void
}

/** 侧栏「店名 · 营业中」：布局挂载时读取一次，店铺设置里切换营业状态后直接写回 */
export const useStoreInfo = create<StoreInfoState>((set) => ({
  store: null,
  refresh: async () => {
    try {
      set({ store: await fetchStore({ silent: true }) })
    } catch {
      // 静默：侧栏状态不是关键信息
    }
  },
  set: (store) => set({ store }),
}))

onLogout(() => useStoreInfo.setState({ store: null }))
