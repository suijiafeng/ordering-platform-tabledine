import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import PlaceholderPage from './pages/placeholder/PlaceholderPage'
import DishesPage from './pages/dishes/DishesPage'
import TablesPage from './pages/tables/TablesPage'
import TablePrintPage from './pages/tables/TablePrintPage'
import SettingsPage from './pages/settings/SettingsPage'
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
import OrdersPage from './pages/orders/OrdersPage'
import KitchenPage from './pages/kitchen/KitchenPage'
import RefundsPage from './pages/refunds/RefundsPage'
import ReportsPage from './pages/reports/ReportsPage'
<<<<<<< HEAD
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
import { useAuthStore } from './store/auth'

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
<<<<<<< HEAD
<<<<<<< HEAD
      { path: 'orders', element: <OrdersPage /> },
      { path: 'kitchen', element: <KitchenPage /> },
      { path: 'refunds', element: <RequireOwner><RefundsPage /></RequireOwner> },
      { path: 'dishes', element: <DishesPage /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'reports', element: <RequireOwner><ReportsPage /></RequireOwner> },
=======
      { path: 'orders', element: <PlaceholderPage title="订单管理" week="第 3 周" /> },
      { path: 'kitchen', element: <PlaceholderPage title="后厨队列" week="第 3 周" /> },
      { path: 'refunds', element: <RequireOwner><PlaceholderPage title="退款管理" week="第 4 周" /></RequireOwner> },
      { path: 'dishes', element: <DishesPage /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'reports', element: <RequireOwner><PlaceholderPage title="数据看板" week="第 4 周" /></RequireOwner> },
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
      { path: 'orders', element: <OrdersPage /> },
      { path: 'kitchen', element: <KitchenPage /> },
      { path: 'refunds', element: <RequireOwner><RefundsPage /></RequireOwner> },
      { path: 'dishes', element: <DishesPage /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'reports', element: <RequireOwner><ReportsPage /></RequireOwner> },
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
      { path: 'staff', element: <RequireOwner><PlaceholderPage title="员工管理" week="V1" /></RequireOwner> },
      { path: 'settings', element: <RequireOwner><SettingsPage /></RequireOwner> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
