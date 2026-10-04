'use client'

import { Button, ErrorBlock, Input, List, Popup, SpinLoading } from 'antd-mobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { changePassword, fetchMe } from '@/lib/api'
import { logout } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { yuan } from '@/lib/format'
import type { CustomerProfile } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { notify } from '@/store/feedback'
import { confirmDialog, getAppShell } from '@/lib/ui'
import { menuPath } from '@/lib/navigation'

/** 我的账户：余额、订单入口、余额流水入口、修改密码、退出登录 */
/** 读取 ?token 需要 useSearchParams：静态导出时必须包在 Suspense 里 */
export default function MePage() {
  return <Suspense><MeView /></Suspense>
}

function MeView() {
  const router = useRouter()
  const tableToken = useSearchParams().get('token')
  const returnToMenu = menuPath(tableToken)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      setProfile(await fetchMe())
      setFailed(false)
    } catch (e) {
      ignoreShownError(e)  // 未登录已由请求层跳转登录页；其他错误显示重试
      setFailed(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const doLogout = async () => {
    if (!(await confirmDialog('退出登录', '退出后再次下单需要重新登录。', '退出'))) return
    logout()
    router.replace('/')
  }

  if (!profile) {
    return <>
      <PageHeader fallback={returnToMenu}>我的账户</PageHeader>
      <div className="empty-state">
        {failed
          ? <ErrorBlock status="disconnected" title="账户加载失败" description={<Button onClick={() => void load()}>重试</Button>} />
          : <SpinLoading />}
      </div>
    </>
  }

  return (
    <div className="page">
      <PageHeader fallback={returnToMenu}>我的账户</PageHeader>
      <div className="content-page">
        <section className="section-card balance-card">
          <div className="balance-owner">{profile.nickname || '会员'} · {profile.phone}</div>
          <div className="balance-label">账户余额</div>
          <div className="balance-value">¥{yuan(profile.balance)}</div>
        </section>
        <p className="hint">余额由店员充值，下单时直接从余额扣费；取消订单或退款会原路返还到余额。</p>

        <List className="section-list">
          <List.Item clickable onClick={() => router.push('/orders')}>我的订单</List.Item>
          <List.Item clickable onClick={() => router.push('/wallet')}>余额流水</List.Item>
          <PasswordItem onChanged={() => router.replace('/login?redirect=%2Fme')} />
          <List.Item clickable onClick={doLogout}>退出登录</List.Item>
        </List>
      </div>
    </div>
  )
}

/** 修改密码：成功后旧 token 失效，需要重新登录 */
function PasswordItem({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const openPopup = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setOpen(true)
  }

  const submit = async () => {
    if (busy) return
    if (!oldPassword) return notify('请输入原密码')
    if (newPassword.length < 6) return notify('新密码至少 6 位')
    if (newPassword !== confirmPassword) return notify('两次输入的新密码不一致')
    if (newPassword === oldPassword) return notify('新密码不能与原密码相同')
    setBusy(true)
    try {
      await changePassword(oldPassword, newPassword)
      notify('密码已修改，请重新登录', 'success')
      logout()
      setOpen(false)
      onChanged()
    } catch (e) {
      ignoreShownError(e)  // 请求层已提示（如原密码错误），弹层保持打开以便重试
    } finally {
      setBusy(false)
    }
  }

  return <>
    <List.Item clickable onClick={openPopup}>修改密码</List.Item>
    <Popup
      visible={open}
      getContainer={getAppShell}
      onMaskClick={busy ? undefined : () => setOpen(false)}
      bodyStyle={{ borderRadius: '18px 18px 0 0' }}
    >
      <div className="form-popup">
        <h2>修改密码</h2>
        <Input type="password" value={oldPassword} onChange={setOldPassword} placeholder="原密码" maxLength={64} clearable autoComplete="current-password" />
        <Input type="password" value={newPassword} onChange={setNewPassword} placeholder="新密码（至少 6 位）" maxLength={64} clearable autoComplete="new-password" />
        <Input type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="再次输入新密码" maxLength={64} clearable autoComplete="new-password" />
        <Button block color="primary" size="large" loading={busy} onClick={submit}>确认修改</Button>
      </div>
    </Popup>
  </>
}
