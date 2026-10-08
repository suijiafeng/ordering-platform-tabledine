import { useEffect } from 'react'
import { Link, useMatches, type UIMatch } from 'react-router-dom'
import { Breadcrumb, Typography } from 'antd'
import { BRAND } from '../config/brand'

const DEFAULT_TITLE = `${BRAND.name} · ${BRAND.subtitle}`

/**
 * 路由 handle：crumb 是该层级在顶栏面包屑里的名字。
 * 动态页面（如订单详情）可以传函数，从路由参数 / loader 数据里生成名字。
 */
export interface RouteHandle {
  crumb?: string | ((match: UIMatch) => string)
}

function crumbText(m: UIMatch): string | null {
  const c = (m.handle as RouteHandle | undefined)?.crumb
  if (!c) return null
  return typeof c === 'function' ? c(m) : c
}

/**
 * 顶栏页面标题 / 面包屑：由路由 handle.crumb 自动生成。
 * 只有一级时显示为页面标题（对应设计稿顶栏左侧标题）；以后增加子页面（嵌套路由各自带 crumb）时自动变成「上级 / 当前」可点击面包屑。
 * 同时同步浏览器标签页标题，开多个标签页时容易区分。
 */
export default function PageBreadcrumb({ compact = false }: { compact?: boolean }) {
  const crumbs = useMatches()
    .map((m) => ({ path: m.pathname, text: crumbText(m) }))
    .filter((c): c is { path: string; text: string } => !!c.text)
  const current = crumbs[crumbs.length - 1]

  const currentText = current?.text
  useEffect(() => {
    document.title = currentText ? `${currentText} · ${BRAND.name}${BRAND.subtitle}` : DEFAULT_TITLE
    // 离开布局（退出到登录页、进入打印页）时恢复默认标题，避免停留在上一个页面名
    return () => { document.title = DEFAULT_TITLE }
  }, [currentText])

  if (!current) return null

  const title = (
    <Typography.Text strong ellipsis style={{ display: 'block', fontSize: compact ? 16 : 18, lineHeight: 1.4 }}>
      {current.text}
    </Typography.Text>
  )
  if (crumbs.length === 1) {
    return title
  }
  return (
    <Breadcrumb
      style={{ minWidth: 0 }}
      items={crumbs.map((c, i) => (i === crumbs.length - 1
        ? { title }
        : { title: <Link to={c.path}>{c.text}</Link> }))}
    />
  )
}
