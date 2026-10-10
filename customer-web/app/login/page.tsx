'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ApiError, passwordLogin } from '@/lib/api'
import { ignoreShownError } from '@/lib/errors'
import { menuPath, safeRedirect } from '@/lib/navigation'
import { notify } from '@/store/feedback'
import { useOrdering } from '@/store/ordering'
import { FieldError, PillButton } from '@/components/ui'

const PHONE_PATTERN = /^1\d{10}$/

/** 会员登录：手机号 + 密码，账号由店员开通；登录后回到来源页 */
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  // 桌台来自 localStorage，首屏静态渲染时没有：挂载后再读，避免 hydration 文本不一致
  const storedTable = useOrdering((state) => state.table)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const table = mounted ? storedTable : null
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // 行内错误：手机号格式、账号或密码错误等，直接标在对应输入框下方
  const [phoneError, setPhoneError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const canSubmit = phone.trim().length > 0 && password.length > 0

  const submit = async () => {
    if (busy) return
    setPhoneError(''); setPasswordError('')
    if (!PHONE_PATTERN.test(phone.trim())) { setPhoneError('请输入 11 位手机号'); return }
    if (!password) { setPasswordError('请输入密码'); return }
    setBusy(true)
    try {
      await passwordLogin(phone.trim(), password)
      notify('登录成功', 'success')
      router.replace(safeRedirect(params.get('redirect')))
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示（账号或密码错误、尝试过多）
      // 40102 账号或密码错误：同时标在密码框下，顾客一眼看到改哪里
      if (e instanceof ApiError && e.code === 40102) setPasswordError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-mark" aria-hidden="true">{table ? table.storeName.trim().charAt(0) : '餐'}</div>
      <h1>{table?.storeName ?? '会员登录'}</h1>
      <div className="sub">扫码点餐 · 余额支付 · 快捷下单</div>

      <form className="login-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div>
          <div className={`field ${phoneError ? 'invalid' : ''}`.trim()}>
            <span className="prefix">+86</span>
            <span className="sep" />
            <input type="tel" inputMode="numeric" autoComplete="tel" maxLength={11} value={phone} placeholder="请输入手机号" aria-label="手机号" aria-invalid={!!phoneError} onChange={(e) => { setPhone(e.target.value); setPhoneError('') }} />
          </div>
          {phoneError && <FieldError>{phoneError}</FieldError>}
        </div>
        <div>
          <div className={`field ${passwordError ? 'invalid' : ''}`.trim()}>
            <input type="password" autoComplete="current-password" maxLength={64} value={password} placeholder="请输入密码" aria-label="密码" aria-invalid={!!passwordError} onChange={(e) => { setPassword(e.target.value); setPasswordError('') }} />
          </div>
          {passwordError && <FieldError>{passwordError}</FieldError>}
        </div>
        <PillButton className="submit" size="lg" block type="submit" disabled={!canSubmit} loading={busy}>登录</PillButton>
      </form>

      <p className="terms">会员账号由店员开通；没有账号或忘记密码，请联系店员。</p>
      <div className="alt">其他方式</div>
      <PillButton variant="ghost" block onClick={() => router.replace(menuPath(table?.qrToken))}>先逛逛菜单</PillButton>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
