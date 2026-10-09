import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import StaffPage from './pages/staff/StaffPage'
import DishesPage from './pages/dishes/DishesPage'
import TablesPage from './pages/tables/TablesPage'
import TablePrintPage from './pages/tables/TablePrintPage'
import SettingsPage from './pages/settings/SettingsPage'
import OrdersPage from './pages/orders/OrdersPage'
import PlaceOrderPage from './pages/orders/PlaceOrderPage'
import KitchenPage from './pages/kitchen/KitchenPage'
import RefundsPage from './pages/refunds/RefundsPage'
import ReportsPage from './pages/reports/ReportsPage'
import MembersPage from './pages/members/MembersPage'
import ForbiddenPage from './pages/errors/ForbiddenPage'
import AuditLogsPage from './pages/audit/AuditLogsPage'
import { useAuthStore } from './store/auth'
import type { RouteHandle } from './components/PageBreadcrumb'

/** 顶栏面包屑名称（见 PageBreadcrumb）。以后加子页面时用嵌套路由，子路由再带自己的 crumb 即可 */
const crumb = (name: string): RouteHandle => ({ crumb: name })

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  const location = useLocation()
  if (!token) {
    // 带上查询参数：从新订单通知等链接（/orders?status=PAID&orderNo=…）过来，登录后回到同一个视图
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

function RequireOwner({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.staff?.role)
  return role === 'OWNER' ? <>{children}</> : <ForbiddenPage need="OWNER" />
}

/** 前厅 / 店主页面：后厨账号只处理前厅确认后的订单，不能进入订单管理、会员等页面（权责分离） */
function RequireFront({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.staff?.role)
  return role === 'KITCHEN' ? <ForbiddenPage need="FRONT" /> : <>{children}</>
}

/** 首页：后厨账号直接进入后厨队列，其他角色进入工作台 */
function HomePage() {
  const role = useAuthStore((s) => s.staff?.role)
  return role === 'KITCHEN' ? <Navigate to="/kitchen" replace /> : <DashboardPage />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/tables/print', element: <RequireAuth><RequireFront><TablePrintPage /></RequireFront></RequireAuth> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, handle: crumb('工作台'), element: <HomePage /> },
      // 后厨可以查看订单（只读），操作按钮在页面里按角色隐藏
      {
        path: 'orders',
        handle: crumb('订单管理'),
        children: [
          { index: true, element: <OrdersPage /> },
          // 代客下单：前厅 / 店主（后厨只能查看订单）
          { path: 'new', handle: crumb('代客下单'), element: <RequireFront><PlaceOrderPage /></RequireFront> },
        ],
      },
      { path: 'kitchen', handle: crumb('后厨队列'), element: <KitchenPage /> },
      { path: 'refunds', handle: crumb('退款管理'), element: <RequireOwner><RefundsPage /></RequireOwner> },
      { path: 'dishes', handle: crumb('菜品管理'), element: <DishesPage /> },
      { path: 'tables', handle: crumb('桌台管理'), element: <RequireFront><TablesPage /></RequireFront> },
      { path: 'reports', handle: crumb('数据看板'), element: <RequireOwner><ReportsPage /></RequireOwner> },
      { path: 'members', handle: crumb('会员充值'), element: <RequireFront><MembersPage /></RequireFront> },
      { path: 'staff', handle: crumb('员工管理'), element: <RequireOwner><StaffPage /></RequireOwner> },
      { path: 'settings', handle: crumb('店铺设置'), element: <RequireOwner><SettingsPage /></RequireOwner> },
      { path: 'audit', handle: crumb('操作日志'), element: <RequireOwner><AuditLogsPage /></RequireOwner> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
