import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Button, Layout, Menu, Space, Tag, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FireOutlined,
  OrderedListOutlined,
  QrcodeOutlined,
  RollbackOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import ChangePasswordButton from '../components/ChangePasswordButton'
import { useOrderPoll } from '../hooks/useOrderPoll'

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="light" width={200} breakpoint="lg" collapsedWidth={64} style={{ minHeight: "100vh" }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
          点餐后台
        </div>
        <Menu mode="inline" selectedKeys={selected} items={items} onClick={({ key }) => navigate(key)} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingInline: 24 }}>
          <Space>
            <Typography.Text>{staff?.name}</Typography.Text>
            <Tag color={isOwner ? 'gold' : 'blue'}>{isOwner ? '店主' : '店员'}</Tag>
            <ChangePasswordButton />
            <Button
              type="link"
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
            >
              退出
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
