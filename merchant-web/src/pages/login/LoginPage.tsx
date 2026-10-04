import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { ApiError } from '../../utils/request'

interface LoginForm {
  username: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { accessToken, setTokens } = useAuthStore()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (accessToken) {
    return <Navigate to={from} replace />
  }

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true)
    setError(null)
    try {
      setTokens(await login(values.username.trim(), values.password))
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: '100%', maxWidth: 360, margin: '0 16px' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>点餐商家后台</Typography.Title>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<LoginForm> onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
        </Form>
      </Card>
    </div>
  )
}
