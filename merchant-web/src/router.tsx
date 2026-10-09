import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/login/LoginPage'
import OrdersPage from './pages/orders/OrdersPage'
import KitchenPage from './pages/kitchen/KitchenPage'
import RefundsPage from './pages/refunds/RefundsPage'
import DishesPage from './pages/dishes/DishesPage'
import TablesPage from './pages/tables/TablesPage'
import TablePrintPage from './pages/tables/TablePrintPage'
import PlaceOrderPage from './pages/orders/PlaceOrderPage'
import MembersPage from './pages/members/MembersPage'
import { useAuthStore } from './store/auth'
import type { RouteHandle } from './components/PageBreadcrumb'

const crumb = (name: string): RouteHandle => ({ crumb: name })

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  const location = useLocation()
  if (!token) {
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
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: 'orders', handle: crumb('订单管理'), children: [{ index: true, element: <OrdersPage /> }, { path: 'new', handle: crumb('代客下单'), element: <PlaceOrderPage /> }] },
      { path: 'kitchen', handle: crumb('后厨队列'), element: <KitchenPage /> },
      { path: 'refunds', handle: crumb('退款管理'), element: <RequireOwner><RefundsPage /></RequireOwner> },
      { path: 'dishes', handle: crumb('菜品管理'), element: <DishesPage /> },
      { path: 'tables', handle: crumb('桌台管理'), element: <TablesPage /> },
      { path: 'members', handle: crumb('会员充值'), element: <MembersPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '/tables/print', element: <RequireAuth><TablePrintPage /></RequireAuth> },
])
