import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Button, Drawer, Layout, Menu, Space, Tag, Typography, theme as antdTheme } from 'antd'
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
import ChangePasswordButton from '../components/ChangePasswordButton'
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
  const { staff, logout } = useAuthStore()
  const isOwner = staff?.role === 'OWNER'
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
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

  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

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
            <Typography.Text strong>点餐后台</Typography.Text>
          </Space>
          <Space size={4}>
            <Tag color={isOwner ? 'gold' : 'blue'} style={{ marginInlineEnd: 0 }}>{staff?.name}</Tag>
            <ThemeToggle size="small" />
            <Button type="link" size="small" onClick={onLogout}>退出</Button>
          </Space>
        </Layout.Header>
        <Drawer placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} width={240} styles={{ body: { padding: 0 } }} title="点餐后台">
          {menu}
          <div style={{ padding: 12 }}><ChangePasswordButton /></div>
        </Drawer>
        <Layout.Content style={{ padding: 12 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="light" width={200} breakpoint="lg" collapsedWidth={64} style={{ minHeight: '100vh', borderInlineEnd: `1px solid ${token.colorSplit}` }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
          点餐后台
        </div>
        {menu}
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: token.colorBgContainer, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingInline: 24, boxShadow: `0 1px 0 ${token.colorSplit}` }}>
          <Space>
            <Typography.Text>{staff?.name}</Typography.Text>
            <Tag color={isOwner ? 'gold' : 'blue'}>{isOwner ? '店主' : '店员'}</Tag>
            <ThemeToggle />
            <ChangePasswordButton />
            <Button type="link" onClick={onLogout}>退出</Button>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
