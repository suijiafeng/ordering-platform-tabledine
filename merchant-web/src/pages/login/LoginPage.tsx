import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Checkbox, Form, Input, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { ApiError } from '../../utils/request'
import BrandLogo from '../../components/BrandLogo'
import { BRAND } from '../../config/brand'
import '../../styles/login.css'

interface LoginForm {
  username: string
  password: string
  remember: boolean
}

const REMEMBER_KEY = 'merchant_last_username'

/** 演示账号提示：只在开发环境或显式配置 VITE_DEMO_ACCOUNT（如「admin / admin123」）时显示 */
const DEMO_ACCOUNT: string | undefined = import.meta.env.VITE_DEMO_ACCOUNT || (import.meta.env.DEV ? 'admin / admin123' : undefined)

function rememberedUsername(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 登录页（R4）：左侧品牌介绍（窄屏隐藏），右侧登录表单 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { accessToken, setTokens } = useAuthStore()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialUsername] = useState(rememberedUsername)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (accessToken) {
    return <Navigate to={from} replace />
  }

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true)
    setError(null)
    const username = values.username.trim()
    try {
      setTokens(await login(username, values.password))
      try {
        if (values.remember) localStorage.setItem(REMEMBER_KEY, username)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch { /* 隐私模式 */ }
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="td-login">
      <aside className="td-login-aside" aria-hidden>
        <BrandLogo size={32} showSubtitle inverted />
        <div>
          <h1>顾客扫码下单，<br />后厨按单出餐，<em>账一目了然。</em></h1>
          <p>会员余额支付、按请求号幂等扣款；前厅接单、后厨队列、退款审核、经营看板，一套后台搞定。</p>
        </div>
        <div className="td-login-facts">
          <div><b>30 秒</b><span>扫码到下单</span></div>
          <div><b>0 重复扣款</b><span>请求号幂等</span></div>
          <div><b>3 种角色</b><span>店主 / 前厅 / 后厨</span></div>
        </div>
        <div className="td-login-preview">
          <div className="dots"><i /><i /><i /></div>
          <div className="kpis">
            <div>今日实收<b>¥4,862</b></div>
            <div>订单<b>86</b></div>
            <div>待接单<b>3</b></div>
          </div>
          <div className="bars">
            {[28, 46, 82, 100, 54, 34, 40, 72].map((h, i) => <i key={i} style={{ height: `${h}%`, opacity: i === 4 ? 0.45 : 1 }} />)}
          </div>
        </div>
      </aside>
      <main className="td-login-main">
        <div className="td-login-form">
          <div className="td-login-mobile-brand" style={{ display: 'none', marginBottom: 32 }}>
            <BrandLogo size={32} showSubtitle />
          </div>
          <h2>登录{BRAND.subtitle}</h2>
          <Typography.Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 28 }}>使用店主或员工账号登录</Typography.Paragraph>
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          <Form<LoginForm> layout="vertical" onFinish={onFinish} size="large" autoComplete="off" requiredMark={false} initialValues={{ username: initialUsername, remember: true }}>
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              extra={<span style={{ fontSize: 12 }}>忘记密码请联系店主重置</span>}
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
              <Checkbox>记住账号</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
          </Form>
          {DEMO_ACCOUNT && <div className="td-login-demo"><b>演示账号</b>{DEMO_ACCOUNT}</div>}
          <div className="td-login-foot">{BRAND.name} · Spring Boot + React + Ant Design</div>
        </div>
      </main>
    </div>
  )
}
