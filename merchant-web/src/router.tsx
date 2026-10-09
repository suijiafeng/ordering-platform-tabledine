import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/login/LoginPage'
import OrdersPage from './pages/orders/OrdersPage'
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
      { path: 'orders', handle: crumb('订单管理'), children: [{ index: true, element: <OrdersPage /> }] },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
