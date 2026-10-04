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

/**
 * 切换主题时临时关闭所有 CSS 过渡：antd 的按钮、输入框、菜单等自带 0.2s 颜色过渡，
 * 而背景、卡片是瞬间变化，不关的话切换瞬间会出现一半深一半浅。
 */
function withoutTransitions(apply: () => void) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  apply()
  // 等新样式落到页面上（React 提交 + 一次样式计算）后再恢复过渡
  window.setTimeout(() => root.classList.remove('theme-switching'), 100)
}

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
      withoutTransitions(() => set({ isDark: media.matches }))
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
      withoutTransitions(() => set({ choice: next, isDark: next === 'dark' }))
    },
  }
})
