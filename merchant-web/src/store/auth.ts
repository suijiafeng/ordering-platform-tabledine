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
  logout: () => {
    save(null)
    set({ accessToken: null, refreshToken: null, staff: null })
    logoutListeners.forEach((listener) => listener())
  },
}))
