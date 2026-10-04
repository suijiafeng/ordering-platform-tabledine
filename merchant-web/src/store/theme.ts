import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'merchant_theme'

function loadMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

function resolve(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && !!media?.matches)
}

interface ThemeState {
  mode: ThemeMode
  /** 实际生效是否深色（system 时跟随操作系统） */
  isDark: boolean
  setMode: (mode: ThemeMode) => void
}

/** 主题偏好：浅色 / 深色 / 跟随系统，持久化到 localStorage */
export const useThemeStore = create<ThemeState>((set, get) => {
  media?.addEventListener('change', () => {
    if (get().mode === 'system') {
      set({ isDark: resolve('system') })
    }
  })
  const mode = loadMode()
  return {
    mode,
    isDark: resolve(mode),
    setMode: (mode) => {
      try {
        localStorage.setItem(STORAGE_KEY, mode)
      } catch {
        // 隐私模式下不持久化
      }
      set({ mode, isDark: resolve(mode) })
    },
  }
})
