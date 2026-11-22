import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { router } from './router'
import { useThemeStore } from './store/theme'
import { AntdStaticBridge } from './utils/antdStatic'
import { buildTheme } from './theme'
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
    <ConfigProvider
      locale={zhCN}
      theme={{
        ...buildTheme(isDark),
        // CSS 变量模式：组件样式只生成一份、颜色通过变量引用，切换主题只改变量值。
        // 不开时深 / 浅两套样式共用同一类名、按插入顺序决定谁生效，按钮、输入框、表头等会停留在旧主题。
        cssVar: true,
        hashed: false,
      }}
      // 设计稿：卡片白底无描边，靠页面暖灰背景区分层次；抽屉 / 弹窗里需要描边的卡片单独写 variant="outlined"
      card={{ variant: 'borderless' }}
      // 期望把关闭按钮放到右上角。antd 5.29 的 Drawer 只会读组件自己的 closable.placement，
      // 这里再声明一次以便后续版本生效；各 Drawer 仍需显式传入 closable={{ placement: 'end' }}。
      drawer={{ closable: { placement: 'end' } }}
    >
      {/* 成功提示默认贴在视口顶部正中，会压住右侧订单抽屉标题，把订单号开头截掉。下移到标题栏下方。 */}
      <AntdApp notification={{ placement: 'bottomRight' }} message={{ top: 88, duration: 2, maxCount: 3 }}>
        <BodyBackground />
        <AntdStaticBridge />
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
