import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
const LoginPage = lazy(() => import('./pages/login/LoginPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const StaffPage = lazy(() => import('./pages/staff/StaffPage'))
const DishesPage = lazy(() => import('./pages/dishes/DishesPage'))
const TablesPage = lazy(() => import('./pages/tables/TablesPage'))
const TablePrintPage = lazy(() => import('./pages/tables/TablePrintPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage'))
const PlaceOrderPage = lazy(() => import('./pages/orders/PlaceOrderPage'))
const KitchenPage = lazy(() => import('./pages/kitchen/KitchenPage'))
const RefundsPage = lazy(() => import('./pages/refunds/RefundsPage'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'))
const MembersPage = lazy(() => import('./pages/members/MembersPage'))
import ForbiddenPage from './pages/errors/ForbiddenPage'
const AuditLogsPage = lazy(() => import('./pages/audit/AuditLogsPage'))
import { useAuthStore } from './store/auth'
import PageLoading from './components/PageLoading'
import type { RouteHandle } from './components/PageBreadcrumb'

/** 各页面按路由拆包，首屏只下载登录页 / 当前页面需要的代码 */
const page = (el: ReactNode) => <Suspense fallback={<PageLoading />}>{el}</Suspense>

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
  return role === 'KITCHEN' ? <Navigate to="/kitchen" replace /> : page(<DashboardPage />)
}

export const router = createBrowserRouter([
  { path: '/login', element: page(<LoginPage />) },
  { path: '/tables/print', element: <RequireAuth><RequireFront>{page(<TablePrintPage />)}</RequireFront></RequireAuth> },
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
          { index: true, element: page(<OrdersPage />) },
          // 代客下单：前厅 / 店主（后厨只能查看订单）
          { path: 'new', handle: crumb('代客下单'), element: <RequireFront>{page(<PlaceOrderPage />)}</RequireFront> },
        ],
      },
      { path: 'kitchen', handle: crumb('后厨队列'), element: page(<KitchenPage />) },
      { path: 'refunds', handle: crumb('退款管理'), element: <RequireOwner>{page(<RefundsPage />)}</RequireOwner> },
      { path: 'dishes', handle: crumb('菜品管理'), element: page(<DishesPage />) },
      { path: 'tables', handle: crumb('桌台管理'), element: <RequireFront>{page(<TablesPage />)}</RequireFront> },
      { path: 'reports', handle: crumb('数据看板'), element: <RequireOwner>{page(<ReportsPage />)}</RequireOwner> },
      { path: 'members', handle: crumb('会员充值'), element: <RequireFront>{page(<MembersPage />)}</RequireFront> },
      { path: 'staff', handle: crumb('员工管理'), element: <RequireOwner>{page(<StaffPage />)}</RequireOwner> },
      { path: 'settings', handle: crumb('店铺设置'), element: <RequireOwner>{page(<SettingsPage />)}</RequireOwner> },
      { path: 'audit', handle: crumb('操作日志'), element: <RequireOwner>{page(<AuditLogsPage />)}</RequireOwner> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
