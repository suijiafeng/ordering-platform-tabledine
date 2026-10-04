import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Input, Text, View } from '@tarojs/components'
import { ApiError } from '../../utils/apiError'
import { passwordLogin } from '../../utils/auth'
import { toast } from '../../utils/toast'
import './index.css'

/**
 * 会员登录（H5）：手机号 + 密码，账号由店家开通、余额由店家充值。
 * 登录成功后回到 redirect 指定的页面（如确认订单页），没有则回到点餐页。
 */
export default function LoginPage() {
  const { redirect = '' } = useRouter().params
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<'phone' | 'password' | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // 从确认订单页跳来：说明为什么需要登录
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
      void Taro.redirectTo({ url: target }).catch(() => Taro.switchTab({ url: target }).catch(() => Taro.redirectTo({ url: '/pages/index/index' })))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className='lg-page'>
      <View className='lg-brand'><Text className='lg-brand-text'>餐</Text></View>
      <Text className='lg-title'>会员登录</Text>
      <Text className='lg-sub'>使用店家为您开通的会员账号登录，下单时从账户余额支付</Text>
      {fromCheckout && <Text className='lg-reason'>登录后即可提交刚才的订单</Text>}
      <View className='lg-field'>
        <Text className='lg-label'>手机号</Text>
        <View className={`lg-input-wrap ${focus === 'phone' ? 'focus' : ''}`}>
          <Input
            className='lg-input'
            type='number'
            maxlength={11}
            placeholder='11 位手机号'
            placeholderClass='lg-placeholder'
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
            onFocus={() => setFocus('phone')}
            onBlur={() => setFocus(null)}
          />
        </View>
      </View>
      <View className='lg-field'>
        <Text className='lg-label'>密码</Text>
        <View className={`lg-input-wrap ${focus === 'password' ? 'focus' : ''}`}>
          <Input
            className='lg-input'
            password={!showPassword}
            placeholder='请输入密码'
            placeholderClass='lg-placeholder'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            onFocus={() => setFocus('password')}
            onBlur={() => setFocus(null)}
            onConfirm={submit}
          />
          <Text className='lg-toggle' onClick={() => setShowPassword((v) => !v)}>{showPassword ? '隐藏' : '显示'}</Text>
        </View>
      </View>
      <View className={`lg-btn ${busy ? 'disabled' : ''}`} onClick={submit}>
        <Text>{busy ? '登录中…' : '登 录'}</Text>
      </View>
      <Text className='lg-tip'>没有账号或忘记密码？请联系店员开通 / 重置。</Text>
    </View>
  )
}
