import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Button, Drawer, Layout, Menu, Space, theme as antdTheme } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FireOutlined,
  MenuOutlined,
  OrderedListOutlined,
  QrcodeOutlined,
  RollbackOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import UserMenu from '../components/UserMenu'
import BrandLogo from '../components/BrandLogo'
import ThemeToggle from '../components/ThemeToggle'
import { useOrderPoll } from '../hooks/useOrderPoll'
import { useIsMobile } from '../hooks/useIsMobile'

interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  ownerOnly?: boolean
}

/** 菜单与需求文档 v1.2 §15 商家端页面清单对应 */
export const NAV_ITEMS: NavItem[] = [
  { key: '/', label: '工作台', icon: <DashboardOutlined /> },
  { key: '/orders', label: '订单管理', icon: <OrderedListOutlined /> },
  { key: '/kitchen', label: '后厨队列', icon: <FireOutlined /> },
  { key: '/refunds', label: '退款管理', icon: <RollbackOutlined />, ownerOnly: true },
  { key: '/dishes', label: '菜品管理', icon: <AppstoreOutlined /> },
  { key: '/tables', label: '桌台管理', icon: <QrcodeOutlined /> },
  { key: '/reports', label: '数据看板', icon: <BarChartOutlined />, ownerOnly: true },
  { key: '/staff', label: '员工管理', icon: <TeamOutlined />, ownerOnly: true },
  { key: '/settings', label: '店铺设置', icon: <SettingOutlined />, ownerOnly: true },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const staff = useAuthStore((s) => s.staff)
  const isOwner = staff?.role === 'OWNER'
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  // 侧栏在 lg 以下自动折叠为图标栏，折叠时只显示 Logo
  const [collapsed, setCollapsed] = useState(false)
  const { token } = antdTheme.useToken()
  // 全局新订单轮询（提示音 + 菜单角标）
  const { counts } = useOrderPoll()

  const badgeFor = (key: string): number => {
    if (!counts) {
      return 0
    }
    if (key === '/orders') {
      return counts.pendingAcceptCount
    }
    if (key === '/kitchen') {
      return counts.pendingAcceptCount + counts.makingCount
    }
    if (key === '/refunds') {
      return counts.applyingRefundCount + counts.failedRefundCount
    }
    return 0
  }

  const items: MenuProps['items'] = useMemo(
    () => NAV_ITEMS.filter((i) => !i.ownerOnly || isOwner).map((i) => {
      const n = badgeFor(i.key)
      return {
        key: i.key,
        icon: i.icon,
        label: n > 0 ? <Badge count={n} size="small" offset={[12, 0]} color={i.key === '/refunds' ? 'red' : 'orange'}>{i.label}</Badge> : i.label,
      }
    }),
    [isOwner, counts], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const selected = NAV_ITEMS.map((i) => i.key)
    .filter((k) => (k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)))
    .slice(-1)

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={selected}
      items={items}
      onClick={({ key }) => {
        navigate(key)
        setMenuOpen(false)
      }}
    />
  )

  if (isMobile) {
    // 手机：顶栏 + 抽屉菜单；内容区留给页面
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Header
          style={{ background: token.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 12, height: 52, lineHeight: '52px', position: 'sticky', top: 0, zIndex: 10, boxShadow: `0 1px 0 ${token.colorSplit}` }}
        >
          <Space>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label="打开菜单" />
            <BrandLogo size={24} />
          </Space>
          <Space size={4}>
            <ThemeToggle size="small" />
            <UserMenu compact />
          </Space>
        </Layout.Header>
        <Drawer placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} width={240} styles={{ body: { padding: 0 } }} title={<BrandLogo size={24} showSubtitle />}>
          {menu}
        </Drawer>
        <Layout.Content style={{ padding: 12 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧栏固定在视口内（sticky），菜单过长时侧栏自身滚动；右侧内容随页面滚动 */}
      <Layout.Sider
        theme="light"
        width={200}
        breakpoint="lg"
        collapsedWidth={64}
        onCollapse={setCollapsed}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto', borderInlineEnd: `1px solid ${token.colorSplit}`, zIndex: 11 }}
      >
        <div
          style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', paddingInline: collapsed ? 0 : 20, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <BrandLogo size={30} showName={!collapsed} showSubtitle />
        </div>
        {menu}
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: token.colorBgContainer, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingInline: 24, boxShadow: `0 1px 0 ${token.colorSplit}`, position: 'sticky', top: 0, zIndex: 10 }}>
          <Space size={8}>
            <ThemeToggle />
            <UserMenu />
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
