'use client'

import { Popup } from 'antd-mobile'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { changePassword, fetchMe } from '@/lib/api'
import { logout } from '@/lib/auth'
import { ignoreShownError } from '@/lib/errors'
import { yuan } from '@/lib/format'
import type { CustomerProfile } from '@/lib/types'
import { notify } from '@/store/feedback'
import { confirmDialog, getAppShell } from '@/lib/ui'
import { menuPath } from '@/lib/navigation'
import { AppBar, EmptyState, PillButton, Skeleton } from '@/components/ui'

/** 我的：余额、订单入口、余额明细入口、修改密码、退出登录 */
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
    if (!(await confirmDialog('确定退出登录吗？', '退出后再次下单需要重新登录', '退出登录'))) return
    logout()
    router.replace(returnToMenu)
  }

  if (!profile) {
    return (
      <div className="screen">
        <AppBar title="我的" fallback={returnToMenu} />
        {failed
          ? <EmptyState icon="!" title="加载失败" desc="请检查网络后重试" action={<PillButton onClick={() => void load()}>重新加载</PillButton>} />
          : <Skeleton rows={2} variant="card" label="加载中…" />}
      </div>
    )
  }

  return (
    <div className="screen">
      <AppBar title="我的" fallback={returnToMenu} />
      <div className="body-pad">
        <div className="wallet-card">
          <div className="who">{profile.nickname || '会员'} · {profile.phone}</div>
          <div className="label">余额</div>
          <div className="value">¥{yuan(profile.balance)}</div>
        </div>
        <p className="t-faint" style={{ margin: '12px 4px 16px', lineHeight: 1.6 }}>
          余额由店员充值，点餐时直接抵扣；取消订单或退款会退回到余额。
        </p>

        <div className="menu-list">
          <button onClick={() => router.push('/orders')}>我的订单<span className="arrow">›</span></button>
          <button onClick={() => router.push('/wallet')}>余额明细<span className="arrow">›</span></button>
          <PasswordItem onChanged={() => router.replace('/login?redirect=%2Fme')} />
          <button onClick={doLogout}>退出登录<span className="arrow">›</span></button>
        </div>
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
    setOldPassword(''); setNewPassword(''); setConfirmPassword('')
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
    <button onClick={openPopup}>修改密码<span className="arrow">›</span></button>
    <Popup visible={open} getContainer={getAppShell} bodyStyle={{ background: 'transparent' }} onMaskClick={busy ? undefined : () => setOpen(false)}>
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="sheet-pad">
          <h2 className="t-hero" style={{ marginBottom: 18 }}>修改密码</h2>
          <div className="login-form" style={{ marginTop: 0 }}>
            <div className="field"><input type="password" value={oldPassword} placeholder="原密码" maxLength={64} autoComplete="current-password" onChange={(e) => setOldPassword(e.target.value)} /></div>
            <div className="field"><input type="password" value={newPassword} placeholder="新密码（至少 6 位）" maxLength={64} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="field"><input type="password" value={confirmPassword} placeholder="再次输入新密码" maxLength={64} autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            <PillButton size="lg" block loading={busy} onClick={submit}>确认修改</PillButton>
          </div>
        </div>
      </div>
    </Popup>
  </>
}
