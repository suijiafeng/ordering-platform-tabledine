import { create } from 'zustand'
import type { StaffProfile, StaffTokenResponse } from '../api/types'

const STORAGE_KEY = 'merchant_auth'

interface PersistedAuth {
  accessToken: string
  refreshToken: string
  staff: StaffProfile
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  staff: StaffProfile | null
  setTokens: (res: StaffTokenResponse) => void
  /** 以 localStorage 为准重读登录态（另一个标签页可能已经续期过）；返回是否有变化 */
  syncFromStorage: () => boolean
  logout: () => void
}

function load(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedAuth) : null
  } catch {
    return null
  }
}

function save(value: PersistedAuth | null) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // 隐私模式等场景无法写入，退化为仅内存登录
  }
}

const initial = load()

/** 退出登录时需要清理的本地状态（消息中心、新订单提醒记忆等）。由各模块注册，避免 auth 反向依赖它们 */
const logoutListeners: Array<() => void> = []

export function onLogout(listener: () => void) {
  logoutListeners.push(listener)
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: initial?.accessToken ?? null,
  refreshToken: initial?.refreshToken ?? null,
  staff: initial?.staff ?? null,
  setTokens: (res) => {
    save({ accessToken: res.accessToken, refreshToken: res.refreshToken, staff: res.staff })
    set({ accessToken: res.accessToken, refreshToken: res.refreshToken, staff: res.staff })
  },
  syncFromStorage: () => {
    const stored = load()
    const current = useAuthStore.getState()
    if ((stored?.accessToken ?? null) === current.accessToken && (stored?.refreshToken ?? null) === current.refreshToken) {
      return false
    }
    set({ accessToken: stored?.accessToken ?? null, refreshToken: stored?.refreshToken ?? null, staff: stored?.staff ?? null })
    return true
  },
  logout: () => {
    save(null)
    set({ accessToken: null, refreshToken: null, staff: null })
    logoutListeners.forEach((listener) => listener())
  },
}))

// refresh token 只能用一次（后端轮换）：一个标签页续期后，其他标签页必须改用新 token，否则会被判为登录失效。
// storage 事件只在「其他」标签页触发，正好用来同步；本页退出登录时其他页也跟着退出。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    const changed = useAuthStore.getState().syncFromStorage()
    if (changed && !useAuthStore.getState().accessToken) {
      logoutListeners.forEach((listener) => listener())
    }
  })
}
