import { Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'

const NAV_ITEMS = [{ key: '/', label: '工作台' }]

/** 简化版布局：侧栏 + 内容区。登录页提交后补全通知铃与轮询 */
export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="light" width={200}>
        <div
          style={{ height: 64, display: 'flex', alignItems: 'center', paddingInline: 20, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <BrandLogo size={30} />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
