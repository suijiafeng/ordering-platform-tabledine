import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/login/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import PlaceholderPage from './pages/placeholder/PlaceholderPage'
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
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <PlaceholderPage title="订单管理" week="第 3 周" /> },
      { path: 'kitchen', element: <PlaceholderPage title="后厨队列" week="第 3 周" /> },
      { path: 'refunds', element: <RequireOwner><PlaceholderPage title="退款管理" week="第 4 周" /></RequireOwner> },
      { path: 'dishes', element: <PlaceholderPage title="菜品管理" week="第 2 周" /> },
      { path: 'tables', element: <PlaceholderPage title="桌台管理" week="第 2 周" /> },
      { path: 'reports', element: <RequireOwner><PlaceholderPage title="数据看板" week="第 4 周" /></RequireOwner> },
      { path: 'staff', element: <RequireOwner><PlaceholderPage title="员工管理" week="V1" /></RequireOwner> },
      { path: 'settings', element: <RequireOwner><PlaceholderPage title="店铺设置" week="第 2 周" /></RequireOwner> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
