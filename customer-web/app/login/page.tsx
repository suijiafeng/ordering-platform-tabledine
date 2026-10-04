'use client'

import { Button, Form, Input } from 'antd-mobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { passwordLogin } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { safeRedirect } from '@/lib/navigation'
import { notify } from '@/store/feedback'

const PHONE_PATTERN = /^1\d{10}$/

/** 会员登录：手机号 + 密码，账号由店员开通；登录后回到来源页 */
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!PHONE_PATTERN.test(phone.trim())) return notify('请输入 11 位手机号')
    if (!password) return notify('请输入密码')
    setBusy(true)
    try {
      await passwordLogin(phone.trim(), password)
      notify('登录成功', 'success')
      router.replace(safeRedirect(params.get('redirect')))
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示（账号或密码错误、尝试过多）
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-page">
      <div className="brand-mark">餐</div>
      <h1>会员登录</h1>
      <p className="subtitle">使用店家为你开通的会员账号，提交订单时直接从账户余额支付。</p>
      <Form layout="horizontal" className="login-form" onFinish={submit}>
        <Form.Item label="手机号">
          <Input type="tel" inputMode="numeric" autoComplete="tel" maxLength={11} value={phone} onChange={setPhone} placeholder="请输入手机号" clearable />
        </Form.Item>
        <Form.Item label="密码">
          <Input type="password" autoComplete="current-password" maxLength={64} value={password} onChange={setPassword} placeholder="请输入密码" onEnterPress={submit} />
        </Form.Item>
      </Form>
      <Button block color="primary" size="large" loading={busy} onClick={submit} className="login-submit">登录</Button>
      <p className="muted login-help">没有账号或忘记密码，请联系店员开通或重置。</p>
      <Button block fill="none" onClick={() => router.replace('/')}>先逛逛菜单</Button>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
