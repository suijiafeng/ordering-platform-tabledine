import { useCallback, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { Button, Cell, Input, Popup } from '@nutui/nutui-react-taro'
import { changePassword, fetchMe, fetchWalletTransactions } from '../../api/customer'
import type { CustomerProfile, WalletTransaction } from '../../api/types'
import PageShell from '../../components/PageShell'
import { goToLogin, isLoggedIn, logout } from '../../utils/auth'
import { confirm } from '../../utils/dialog'
import { ignoreShownError } from '../../utils/errors'
import { formatYuan } from '../../utils/money'
import { formatTime } from '../../utils/order'
import { toast } from '../../utils/toast'
import './index.css'

const TXN_TEXT: Record<WalletTransaction['type'], string> = { RECHARGE: '充值', PAY: '消费', REFUND: '退款返还' }

/** 我的：余额、流水、修改密码、退出登录 */
export default function MePage() {
  const [me, setMe] = useState<CustomerProfile | null>(null)
  const [txns, setTxns] = useState<WalletTransaction[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [profile, page] = await Promise.all([fetchMe(), fetchWalletTransactions(1, 50)])
      setMe(profile)
      setTxns(page.list)
      setLoadFailed(false)
    } catch (e) {
      setLoadFailed(true)
      ignoreShownError(e)  // 401 已由请求层跳转登录页
    }
  }, [])

  useDidShow(() => {
    if (!isLoggedIn()) {
      goToLogin('/pages/me/index')
      return
    }
    void load()
  })

  const submitPassword = async () => {
    if (busy) return
    if (newPwd.length < 6) {
      toast('新密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      await changePassword(oldPwd, newPwd)
      toast('密码已修改，请重新登录')
      logout()
      setPwdOpen(false)
      goToLogin('/pages/me/index')
    } catch (e) {
      ignoreShownError(e)
    } finally {
      setBusy(false)
    }
  }

  const doLogout = async () => {
    if (!(await confirm('退出登录', '退出后再次下单需要重新登录。'))) return
    logout()
    void Taro.redirectTo({ url: '/pages/index/index' })
  }

  if (!me) {
    return (
      <PageShell>
        <View className='me-loading' onClick={() => loadFailed && load()}>
          <Text>{loadFailed ? '加载失败，点击重试' : '加载中…'}</Text>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <View className='me-page'>
        <View className='me-card me-head'>
          <View>
            <Text className='me-name'>{me.nickname || '会员'}</Text>
            <Text className='me-phone'>{me.phone}</Text>
          </View>
          <View className='me-balance'>
            <Text className='me-balance-label'>账户余额</Text>
            <Text className='me-balance-value'>¥{formatYuan(me.balance)}</Text>
          </View>
        </View>
        <Text className='me-hint'>余额由店员充值，下单时直接从余额扣费；取消订单或退款会原路返还到余额。</Text>

        <Cell.Group>
          <Cell title='我的订单' clickable onClick={() => Taro.navigateTo({ url: '/pages/order-list/index' })} />
          <Cell title='修改密码' clickable onClick={() => { setOldPwd(''); setNewPwd(''); setPwdOpen(true) }} />
          <Cell title='退出登录' clickable onClick={doLogout} />
        </Cell.Group>

        <View className='me-card'>
          <Text className='me-section'>余额流水</Text>
          {txns.length === 0 && <Text className='me-empty'>暂无流水</Text>}
          {txns.map((t) => (
            <View key={t.id} className='me-txn'>
              <View className='me-txn-info'>
                <Text className='me-txn-type'>{TXN_TEXT[t.type] ?? t.type}{t.remark ? ` · ${t.remark}` : ''}</Text>
                <Text className='me-txn-time'>{formatTime(t.createdAt)}{t.outTradeNo ? ` · 订单 ${t.outTradeNo}` : ''}</Text>
              </View>
              <View className='me-txn-amount'>
                <Text className={`me-txn-delta ${t.credit ? 'credit' : ''}`}>{t.credit ? '+' : '-'}¥{formatYuan(t.amount)}</Text>
                <Text className='me-txn-after'>余额 ¥{formatYuan(t.balanceAfter)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Popup visible={pwdOpen} position='bottom' round closeable onClose={() => setPwdOpen(false)}>
          <View className='me-popup'>
            <Text className='me-section'>修改密码</Text>
            <View className='me-input'><Input type='password' placeholder='原密码' value={oldPwd} onChange={(v) => setOldPwd(v)} /></View>
            <View className='me-input'><Input type='password' placeholder='新密码（至少 6 位）' value={newPwd} onChange={(v) => setNewPwd(v)} /></View>
            <Button type='primary' size='large' block loading={busy} style={{ marginTop: '32px' }} onClick={submitPassword}>确认修改</Button>
          </View>
        </Popup>
      </View>
    </PageShell>
  )
}
