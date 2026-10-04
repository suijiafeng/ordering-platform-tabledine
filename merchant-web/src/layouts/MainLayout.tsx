import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Drawer, Layout, Menu, Space, notification, theme as antdTheme } from 'antd'
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
  WalletOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import UserMenu from '../components/UserMenu'
import BrandLogo from '../components/BrandLogo'
import ThemeToggle from '../components/ThemeToggle'
import NotificationBell from '../components/NotificationBell'
import { unlockSound, useOrderPoll, usePollStore } from '../hooks/useOrderPoll'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNotificationStore } from '../store/notifications'

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
  { key: '/members', label: '会员充值', icon: <WalletOutlined /> },
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
  const addMessage = useNotificationStore((s) => s.add)
  const initialPending = usePollStore((s) => s.initialPending)
  const consumeInitial = usePollStore((s) => s.consumeInitial)
  const lastArrival = usePollStore((s) => s.lastArrival)
  const soundBlocked = usePollStore((s) => s.soundBlocked && s.soundEnabled)
  // 浏览器只允许在用户手势里启用声音：页面上任意一次点击 / 按键都尝试解锁（重载后无人操作时提示音会被静音）
  useEffect(() => {
    unlockSound()
    window.addEventListener('pointerdown', unlockSound)
    window.addEventListener('keydown', unlockSound)
    return () => {
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
    }
  }, [])
  const soundBanner = soundBlocked ? (
    <Alert type="warning" showIcon banner style={{ marginBottom: 12, cursor: 'pointer' }} onClick={unlockSound}
      message="浏览器暂停了新订单提示音，点击这里（或页面任意位置）启用" />
  ) : null
  // 挂载前已经提醒过的那一批不再重复弹出（从打印页返回等情况会重新挂载布局）
  const handledArrivalSeq = useRef(usePollStore.getState().lastArrival?.seq ?? 0)
  // 新订单进入消息中心，并显示 5 秒通知；点击通知或铃铛中的记录可打开订单
  useEffect(() => {
    if (!lastArrival || lastArrival.seq <= handledArrivalSeq.current) {
      return
    }
    handledArrivalSeq.current = lastArrival.seq
    const { orderNos } = lastArrival
    const first = orderNos[0]
    const title = orderNos.length === 1 ? '新订单，请接单' : `${orderNos.length} 个新订单，请接单`
    const description = orderNos.length === 1 ? `订单号 ${first}` : `订单号 ${orderNos.slice(0, 3).join('、')}${orderNos.length > 3 ? ' 等' : ''}`
    const link = orderNos.length === 1 ? `/orders?status=PAID&orderNo=${first}` : '/orders?status=PAID'
    addMessage({ kind: 'ORDER', title, description, link, dedupeKey: `new-order:${[...orderNos].sort().join(',')}` })
    notification.open({ key: 'new-order', message: title, description, duration: 5, showProgress: true, placement: 'topRight', onClick: () => navigate(link) })
  }, [lastArrival, navigate, addMessage])
  useEffect(() => {
    if (initialPending > 0) {
      const title = `有 ${initialPending} 单待接单`
      const description = '这些订单在你打开后台前已支付，请尽快处理。'
      addMessage({ kind: 'ORDER', title, description, link: '/orders?status=PAID', dedupeKey: `initial-pending:${counts?.pendingOrderNos.slice().sort().join(',') ?? initialPending}` })
      notification.warning({ key: 'initial-pending', message: title, description, duration: 5, showProgress: true, placement: 'topRight', onClick: () => navigate('/orders?status=PAID') })
      consumeInitial()
    }
  }, [initialPending, counts, consumeInitial, navigate, addMessage])

  // 退款申请超过 2 小时未审核（需求 §7.3：再次提醒店主，不自动同意）。数量增加时提醒一次；处理完清零后再出现会再次提醒
  const overdueRefunds = counts?.overdueRefundCount ?? 0
  useEffect(() => {
    if (!isOwner) {
      return
    }
    // 已提醒数量放在全局 store：布局重新挂载时不会把同一批超时退款再提醒一遍
    const notified = usePollStore.getState().overdueNotified
    if (overdueRefunds === 0) {
      if (notified !== 0) usePollStore.setState({ overdueNotified: 0 })
      return
    }
    if (overdueRefunds > notified) {
      usePollStore.setState({ overdueNotified: overdueRefunds })
      const title = `${overdueRefunds} 笔退款申请超过 2 小时未审核`
      const description = '顾客正在等待结果，请尽快同意或拒绝。'
      addMessage({ kind: 'REFUND', title, description, link: '/refunds?status=APPLYING' })
      notification.warning({ key: 'overdue-refund', message: title, description, duration: 5, showProgress: true, placement: 'topRight', onClick: () => navigate('/refunds?status=APPLYING') })
    }
  }, [overdueRefunds, isOwner, navigate, addMessage])

  // 计数增长表示出现新的退款申请或退款失败；首次加载只建立基线，避免把历史数据当成新消息。
  const refundCountsRef = useRef<{ applying: number; failed: number } | null>(null)
  useEffect(() => {
    if (!counts || !isOwner) return
    const current = { applying: counts.applyingRefundCount, failed: counts.failedRefundCount }
    const previous = refundCountsRef.current
    refundCountsRef.current = current
    if (!previous) return
    if (current.applying > previous.applying) {
      const added = current.applying - previous.applying
      const title = `新增 ${added} 笔退款申请`
      addMessage({ kind: 'REFUND', title, description: '顾客已提交退款申请，请及时审核。', link: '/refunds?status=APPLYING' })
      notification.warning({ key: 'new-refund', message: title, description: '顾客已提交退款申请，请及时审核。', duration: 5, showProgress: true, placement: 'topRight', onClick: () => navigate('/refunds?status=APPLYING') })
    }
    if (current.failed > previous.failed) {
      const added = current.failed - previous.failed
      const title = `${added} 笔退款处理失败`
      addMessage({ kind: 'REFUND', title, description: '请重试退款或登记线下退款。', link: '/refunds?status=FAILED' })
      notification.error({ key: 'failed-refund', message: title, description: '请重试退款或登记线下退款。', duration: 5, showProgress: true, placement: 'topRight', onClick: () => navigate('/refunds?status=FAILED') })
    }
  }, [counts, isOwner, navigate, addMessage])

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
            <NotificationBell />
            <ThemeToggle size="small" />
            <UserMenu compact />
          </Space>
        </Layout.Header>
        <Drawer placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} width={240} styles={{ body: { padding: 0 } }} title={<BrandLogo size={24} showSubtitle />}>
          {menu}
        </Drawer>
        <Layout.Content style={{ padding: 12 }}>
          {soundBanner}
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
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          {soundBanner}
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
