import type { ReactNode } from 'react'
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  DashboardOutlined,
  EditOutlined,
  FireOutlined,
  OrderedListOutlined,
  QrcodeOutlined,
  RollbackOutlined,
  SettingOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { StaffRole } from '../api/types'

export interface NavItem {
  key: string
  label: string
  icon: ReactNode
  ownerOnly?: boolean
  /** 前厅 / 店主才能看；后厨账号隐藏（权责分离：后厨只处理前厅确认过的订单） */
  frontOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** 侧栏分组：经营 / 菜品与桌台 / 会员与资金 / 系统（R4 设计稿） */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: '经营',
    items: [
      { key: '/', label: '工作台', icon: <DashboardOutlined />, frontOnly: true },
      { key: '/orders', label: '订单管理', icon: <OrderedListOutlined /> },
      { key: '/kitchen', label: '后厨队列', icon: <FireOutlined /> },
      { key: '/orders/new', label: '代客下单', icon: <EditOutlined />, frontOnly: true },
    ],
  },
  {
    label: '菜品与桌台',
    items: [
      { key: '/dishes', label: '菜品管理', icon: <AppstoreOutlined /> },
      { key: '/tables', label: '桌台管理', icon: <QrcodeOutlined />, frontOnly: true },
    ],
  },
  {
    label: '会员与资金',
    items: [
      { key: '/members', label: '会员充值', icon: <WalletOutlined />, frontOnly: true },
      { key: '/refunds', label: '退款管理', icon: <RollbackOutlined />, ownerOnly: true },
      { key: '/reports', label: '数据看板', icon: <BarChartOutlined />, ownerOnly: true },
    ],
  },
  {
    label: '系统',
    items: [
      { key: '/staff', label: '员工管理', icon: <TeamOutlined />, ownerOnly: true },
      { key: '/settings', label: '店铺设置', icon: <SettingOutlined />, ownerOnly: true },
      { key: '/audit', label: '操作日志', icon: <AuditOutlined />, ownerOnly: true },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** 按角色过滤；空分组整体隐藏 */
export function visibleGroups(role: StaffRole | undefined): NavGroup[] {
  const isOwner = role === 'OWNER'
  const isKitchen = role === 'KITCHEN'
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.ownerOnly || isOwner) && (!i.frontOnly || !isKitchen)) }))
    .filter((g) => g.items.length > 0)
}

/** 当前路径对应的菜单项：取最长前缀匹配（/orders/new 优先于 /orders） */
export function activeNavKey(pathname: string): string | null {
  let best: string | null = null
  for (const { key } of NAV_ITEMS) {
    const hit = key === '/' ? pathname === '/' : pathname === key || pathname.startsWith(`${key}/`)
    if (hit && (best === null || key.length > best.length)) best = key
  }
  return best
}

/** 顶栏小字面包屑用：当前页面所在分组名 */
export function navGroupOf(pathname: string): string | null {
  const key = activeNavKey(pathname)
  return NAV_GROUPS.find((g) => g.items.some((i) => i.key === key))?.label ?? null
}
