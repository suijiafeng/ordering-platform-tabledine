import type { CSSProperties, ReactNode } from 'react'
import { theme as antdTheme } from 'antd'

/**
 * 内容面板：白底圆角、无描边（对应设计稿的列表 / 表格容器）。
 * 页面上的操作（标签页、按钮、搜索）直接放在页面背景上，只有数据区域用 Panel 包起来，
 * 不再把整页套进一个大卡片。表格用默认内边距，左右留白给分页器。
 */
export default function Panel({ children, padding = '4px 16px', style }: { children: ReactNode; padding?: CSSProperties['padding']; style?: CSSProperties }) {
  const { token } = antdTheme.useToken()
  return (
    <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, padding, ...style }}>
      {children}
    </div>
  )
}

/** 页面顶部操作栏：主操作 + 搜索 / 筛选，放在页面背景上，窄屏自动换行 */
export function PageToolbar({ children, extra, style }: { children?: ReactNode; extra?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, ...style }}>
      {children}
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>{extra}</div>}
    </div>
  )
}
