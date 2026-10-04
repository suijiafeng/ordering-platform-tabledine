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
import KitchenPage from './pages/kitchen/KitchenPage'
import RefundsPage from './pages/refunds/RefundsPage'
import ReportsPage from './pages/reports/ReportsPage'
import MembersPage from './pages/members/MembersPage'
import { useAuthStore } from './store/auth'

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
  return role === 'OWNER' ? <>{children}</> : <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/tables/print', element: <RequireAuth><TablePrintPage /></RequireAuth> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'kitchen', element: <KitchenPage /> },
      { path: 'refunds', element: <RequireOwner><RefundsPage /></RequireOwner> },
      { path: 'dishes', element: <DishesPage /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'reports', element: <RequireOwner><ReportsPage /></RequireOwner> },
      { path: 'members', element: <MembersPage /> },
      { path: 'staff', element: <RequireOwner><StaffPage /></RequireOwner> },
      { path: 'settings', element: <RequireOwner><SettingsPage /></RequireOwner> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
