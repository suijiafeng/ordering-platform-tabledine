import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { Button, Input } from '@nutui/nutui-react-taro'
import PageShell from '../../components/PageShell'
import { ApiError } from '../../utils/apiError'
import { passwordLogin } from '../../utils/auth'
import { toast } from '../../utils/toast'
import './index.css'

/**
 * 会员登录：手机号 + 密码，账号由店家开通、余额由店家充值。
 * 登录成功后回到 redirect 指定的页面（如确认订单页），没有则回到点餐页。
 */
export default function LoginPage() {
  const { redirect = '' } = useRouter().params
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const fromCheckout = decodeURIComponent(redirect).includes('checkout')

  const submit = async () => {
    if (busy) return
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast('请输入 11 位手机号')
      return
    }
    if (!password) {
      toast('请输入密码')
      return
    }
    setBusy(true)
    try {
      await passwordLogin(phone.trim(), password)
      toast('登录成功')
      const target = redirect ? decodeURIComponent(redirect) : '/pages/index/index'
      // 登录页是 navigateTo 进来的：回跳用 redirectTo 把登录页替换掉，避免返回时再回到登录页
      void Taro.redirectTo({ url: target }).catch(() => Taro.redirectTo({ url: '/pages/index/index' }))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <View className='lg-page'>
        <View className='lg-brand'><Text className='lg-brand-text'>餐</Text></View>
        <Text className='lg-title'>会员登录</Text>
        <Text className='lg-sub'>使用店家为您开通的会员账号登录，下单时从账户余额支付</Text>
        {fromCheckout && <Text className='lg-reason'>登录后即可提交刚才的订单</Text>}
        <View className='lg-form'>
          <View className='lg-field'>
            <Text className='lg-label'>手机号</Text>
            <Input type='number' maxLength={11} placeholder='11 位手机号' value={phone} clearable onChange={(v) => setPhone(v)} />
          </View>
          <View className='lg-field'>
            <Text className='lg-label'>密码</Text>
            <Input type='password' placeholder='请输入密码' value={password} onChange={(v) => setPassword(v)} />
          </View>
        </View>
        <Button type='primary' size='large' block loading={busy} className='lg-btn' onClick={submit}>登 录</Button>
        <Text className='lg-tip'>没有账号或忘记密码？请联系店员开通 / 重置。</Text>
      </View>
    </PageShell>
  )
}
