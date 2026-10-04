import { create } from 'zustand'

const STORAGE_KEY = 'merchant_theme'

type Choice = 'light' | 'dark'

function loadChoice(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

interface ThemeState {
  /** 用户手动选择；null 表示从未选择，跟随操作系统 */
  choice: Choice | null
  /** 实际生效是否深色 */
  isDark: boolean
  /** 在浅色 / 深色之间切换，并记住选择 */
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  // 用户没选过时与系统保持同步
  const sync = () => {
    if (get().choice === null && media && get().isDark !== media.matches) {
      set({ isDark: media.matches })
    }
  }
  if (media) {
    if (media.addEventListener) {
      media.addEventListener('change', sync)
    } else {
      media.addListener(sync)  // Safari < 14
    }
  }
  // 兜底：部分浏览器 / WebView 在后台切换系统主题时不派发 change，回到页面时再对一次
  window.addEventListener('focus', sync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync()
  })
  const choice = loadChoice()
  return {
    choice,
    isDark: choice ? choice === 'dark' : !!media?.matches,
    toggle: () => {
      const next: Choice = get().isDark ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // 隐私模式下不持久化
      }
      set({ choice: next, isDark: next === 'dark' })
    },
  }
})
