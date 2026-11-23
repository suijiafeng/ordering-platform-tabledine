import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Alert, App, Button, Drawer, Grid, Layout, Space, theme as antdTheme } from 'antd'
import dayjs from 'dayjs'
import { MenuOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import UserMenu from '../components/UserMenu'
import ThemeToggle from '../components/ThemeToggle'
import NotificationBell from '../components/NotificationBell'
import PageBreadcrumb from '../components/PageBreadcrumb'
import SideNav from '../components/SideNav'
import NewOrderBanner from '../components/NewOrderBanner'
import { useOrderPoll, usePollStore } from '../hooks/useOrderPoll'
import { playSound, unlockSound, useSoundStore } from '../utils/sound'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNotificationStore } from '../store/notifications'
import { useStoreInfo } from '../store/storeInfo'
import { navGroupOf } from './nav'

export { NAV_ITEMS } from './nav'

const COLLAPSE_KEY = 'merchant_sider_collapsed'

function loadCollapsed(): boolean | null {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const staff = useAuthStore((s) => s.staff)
  const isOwner = staff?.role === 'OWNER'
  const isKitchen = staff?.role === 'KITCHEN'
  const isMobile = useIsMobile()
  // 用 App 上下文的 notification，才能跟随深色模式，避免静态方法的主题警告
  const { notification } = App.useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  // 平板和小屏桌面（< 1200）默认折叠为图标栏，为后厨三列和数据表保留内容宽度；用户手动切换后记住选择
  const screens = Grid.useBreakpoint()
  const [collapseChoice, setCollapseChoice] = useState<boolean | null>(loadCollapsed)
  const collapsed = collapseChoice ?? screens.xl === false
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapseChoice(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* 隐私模式 */ }
  }
  const refreshStore = useStoreInfo((s) => s.refresh)
  useEffect(() => { void refreshStore() }, [refreshStore])
  const { token } = antdTheme.useToken()
  // 全局新订单轮询（提示音 + 菜单角标）
  const { counts, retry } = useOrderPoll()
  const addMessage = useNotificationStore((s) => s.add)
  const initialPending = usePollStore((s) => s.initialPending)
  const consumeInitial = usePollStore((s) => s.consumeInitial)
  const lastArrival = usePollStore((s) => s.lastArrival)
  const soundBlocked = useSoundStore((s) => s.blocked && s.enabled)
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
      message="浏览器暂停了提示音，点击这里（或页面任意位置）启用" />
  ) : null
  // 全局断线横幅：连续 2 次轮询连不上服务器（约 10 秒）才显示，避免偶发抖动刷屏
  const netFailures = usePollStore((s) => s.netFailures)
  const lastSyncAt = usePollStore((s) => s.lastSyncAt)
  // 断线 / 恢复各响一次：与横幅同一阈值（连续 2 次失败），偶发抖动不出声
  const offline = netFailures >= 2
  const wasOffline = useRef(false)
  useEffect(() => {
    if (offline && !wasOffline.current) playSound('networkLost')
    if (!offline && wasOffline.current) playSound('networkRestored')
    wasOffline.current = offline
  }, [offline])
  // 后厨队列页有自己的断线告警（含队列最后同步时间），那里不再重复显示全局横幅
  const netBanner = offline && !location.pathname.startsWith('/kitchen') ? (
    <Alert
      type="error"
      showIcon
      banner
      style={{ marginBottom: 12 }}
      message="网络连接中断，正在重试…"
      description={lastSyncAt ? `最后同步 ${dayjs(lastSyncAt).format('HH:mm:ss')}，新订单提醒已暂停，恢复后自动同步。` : '无法连接服务器，请检查网络。'}
      action={<Button size="small" danger onClick={() => void retry()}>立即重试</Button>}
    />
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
    const description = orderNos.length === 1 ? `订单号 ${first}` : `订单号 ${orderNos.slice(0, 3).join('、')}${orderNos.length > 3 ? ' 等' : ''}`
    // 后厨收到的是前厅已确认的制作单；前厅 / 店主收到的是待接单的新订单
    const title = isKitchen
      ? (orderNos.length === 1 ? '前厅已确认新订单，请开始制作' : `前厅已确认 ${orderNos.length} 单，请开始制作`)
      : (orderNos.length === 1 ? '新订单，请接单' : `${orderNos.length} 个新订单，请接单`)
    const link = isKitchen ? '/kitchen' : orderNos.length === 1 ? `/orders?status=PAID&orderNo=${first}` : '/orders?status=PAID'
    addMessage({ kind: 'ORDER', title, description, link, dedupeKey: `${isKitchen ? 'new-making' : 'new-order'}:${[...orderNos].sort().join(',')}` })
    // 前厅 / 店主看内容区顶部的待接单横幅（NewOrderBanner），不再弹右下角浮层压住按钮
    if (!isKitchen) return
    notification.open({ key: 'new-order', message: title, description, duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate(link) })
  }, [lastArrival, navigate, addMessage, isKitchen, notification])
  useEffect(() => {
    if (initialPending > 0) {
      const title = isKitchen ? `有 ${initialPending} 单待制作` : `有 ${initialPending} 单待接单`
      const description = isKitchen ? '前厅已确认这些订单，请按顺序制作。' : '这些订单在你打开后台前已支付，请尽快处理。'
      const link = isKitchen ? '/kitchen' : '/orders?status=PAID'
      const nos = isKitchen ? counts?.makingOrderNos : counts?.pendingOrderNos
      addMessage({ kind: 'ORDER', title, description, link, dedupeKey: `initial-${isKitchen ? 'making' : 'pending'}:${nos?.slice().sort().join(',') ?? initialPending}` })
      if (isKitchen) notification.warning({ key: 'initial-pending', message: title, description, duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate(link) })
      consumeInitial()
    }
  }, [initialPending, counts, consumeInitial, navigate, addMessage, isKitchen, notification])

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
      playSound('refundOverdue')
      notification.warning({ key: 'overdue-refund', message: title, description, duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate('/refunds?status=APPLYING') })
    }
  }, [overdueRefunds, isOwner, navigate, addMessage, notification])

  // 顾客接单后申请取消：数量增加时提醒前厅 / 店主（后厨不处理取消申请）。首次加载只建立基线
  const cancelCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (!counts || isKitchen) return
    const current = counts.cancelRequestCount ?? 0
    const previous = cancelCountRef.current
    cancelCountRef.current = current
    if (previous !== null && current > previous) {
      const title = `${current - previous} 位顾客申请取消订单`
      const description = '后厨暂停制作这些订单，请尽快同意或拒绝。'
      const link = '/orders?status=CANCEL_REQUEST'
      addMessage({ kind: 'ORDER', title, description, link })
      notification.warning({ key: 'cancel-request', message: title, description, duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate(link) })
      playSound('cancelRequest')
    }
  }, [counts, isKitchen, navigate, addMessage, notification])

  // 后厨出餐（待送餐数增加）：提醒前厅取餐送达。首次加载只建立基线
  const readyCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (!counts || isKitchen) return
    const current = counts.readyCount ?? 0
    const previous = readyCountRef.current
    readyCountRef.current = current
    if (previous !== null && current > previous) playSound('orderReady')
  }, [counts, isKitchen])

  // 计数增长表示出现新的退款申请或退款失败；首次加载只建立基线，避免把历史数据当成新消息。
  const refundCountsRef = useRef<{ applying: number; failed: number } | null>(null)
  useEffect(() => {
    if (!counts || !isOwner) return
    const current = { applying: counts.applyingRefundCount, failed: counts.failedRefundCount }
    const previous = refundCountsRef.current
    refundCountsRef.current = current
    if (!previous) return
    if (current.applying > previous.applying || current.failed > previous.failed) playSound('refundAttention')
    if (current.applying > previous.applying) {
      const added = current.applying - previous.applying
      const title = `新增 ${added} 笔退款申请`
      addMessage({ kind: 'REFUND', title, description: '顾客已提交退款申请，请及时审核。', link: '/refunds?status=APPLYING' })
      notification.warning({ key: 'new-refund', message: title, description: '顾客已提交退款申请，请及时审核。', duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate('/refunds?status=APPLYING') })
    }
    if (current.failed > previous.failed) {
      const added = current.failed - previous.failed
      const title = `${added} 笔退款处理失败`
      addMessage({ kind: 'REFUND', title, description: '请重试退款或登记线下退款。', link: '/refunds?status=FAILED' })
      notification.error({ key: 'failed-refund', message: title, description: '请重试退款或登记线下退款。', duration: 5, showProgress: true, placement: 'bottomRight', onClick: () => navigate('/refunds?status=FAILED') })
    }
  }, [counts, isOwner, navigate, addMessage, notification])

  const badgeFor = (key: string): { count: number; hot?: boolean } => {
    if (!counts) {
      return { count: 0 }
    }
    if (key === '/orders') {
      // 前厅要处理的：待接单 + 顾客取消申请 + 待送餐 + 先吃后付未结账；后厨对订单只读，不显示待办角标
      if (isKitchen) return { count: 0 }
      const urgent = counts.pendingAcceptCount + (counts.cancelRequestCount ?? 0)
      return { count: urgent + (counts.readyCount ?? 0) + (counts.unsettledCount ?? 0), hot: urgent > 0 }
    }
    if (key === '/kitchen') {
      // 与后厨队列同一口径：只有前厅已确认的制作中订单
      return { count: counts.makingCount, hot: isKitchen }
    }
    if (key === '/refunds') {
      return { count: counts.applyingRefundCount + counts.failedRefundCount, hot: true }
    }
    return { count: 0 }
  }

  const banner = !isKitchen && counts ? (
    <NewOrderBanner pendingOrderNos={counts.pendingOrderNos} latestHint={lastArrival?.orderNos[0]} onChanged={() => void retry()} />
  ) : null
  const group = navGroupOf(location.pathname)

  if (isMobile) {
    // 手机：顶栏 + 抽屉菜单；内容区留给页面
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Header
          style={{ background: token.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 12, height: 52, lineHeight: '52px', position: 'sticky', top: 0, zIndex: 10, boxShadow: `0 1px 0 ${token.colorSplit}` }}
        >
          <Space align="center" style={{ minWidth: 0 }}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label="打开菜单" />
            <PageBreadcrumb compact />
          </Space>
          <Space size={4}>
            <NotificationBell />
            <ThemeToggle size="small" />
            <UserMenu compact />
          </Space>
        </Layout.Header>
        <Drawer
          closable={{ placement: 'end' }}
          placement="left"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          width={260}
          styles={{ body: { padding: 0, background: 'var(--td-sider)' }, header: { display: 'none' } }}
        >
          <SideNav badgeFor={badgeFor} onNavigate={() => setMenuOpen(false)} />
        </Drawer>
        <Layout.Content style={{ padding: 12 }}>
          {netBanner}
          {soundBanner}
          {banner}
          <Outlet />
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧栏固定在视口内（sticky），菜单过长时侧栏自身滚动；右侧内容随页面滚动 */}
      <Layout.Sider
        theme="dark"
        width={232}
        collapsed={collapsed}
        collapsedWidth={72}
        trigger={null}
        style={{ position: 'sticky', top: 0, height: '100vh', zIndex: 11 }}
      >
        <SideNav collapsed={collapsed} onToggle={toggleCollapsed} badgeFor={badgeFor} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: token.colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingInline: 24, boxShadow: `0 1px 0 ${token.colorSplit}`, position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="td-header-title">
            {group && <span className="td-header-crumb">{group}</span>}
            <PageBreadcrumb />
          </div>
          <Space size={8}>
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          {netBanner}
          {soundBanner}
          {banner}
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
