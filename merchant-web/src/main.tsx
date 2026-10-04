import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { router } from './router'
import { useThemeStore } from './store/theme'
import './styles/responsive.css'

dayjs.locale('zh-cn')

/** 页面背景跟随主题（antd 只管组件，body 要自己设） */
function BodyBackground() {
  const { token } = antdTheme.useToken()
  const isDark = useThemeStore((s) => s.isDark)
  useEffect(() => {
    document.body.style.background = token.colorBgLayout
    document.body.style.color = token.colorText
    // 让原生滚动条 / 表单控件也切换配色
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [token.colorBgLayout, token.colorText, isDark])
  return null
}

function Root() {
  const isDark = useThemeStore((s) => s.isDark)
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
      <AntdApp>
        <BodyBackground />
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
