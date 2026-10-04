import Taro from '@tarojs/taro'

/**
 * 获取小程序登录凭证（双端差异集中在这里）。
 * - 微信：Taro.login() → code
 * - 支付宝：my.getAuthCode({ scopes: 'auth_base' }) → authCode（静默授权，用户无感知）
 */
export function getLoginCode(): Promise<string> {
  if (process.env.TARO_ENV === 'alipay') {
    return new Promise((resolve, reject) => {
      my.getAuthCode({
        scopes: 'auth_base',
        success: (res: { authCode?: string }) => {
          if (res.authCode) {
            resolve(res.authCode)
          } else {
            reject(new Error('获取支付宝授权码失败'))
          }
        },
        fail: (err: unknown) => reject(err),
      })
    })
  }
  return Taro.login().then((res) => {
    if (!res.code) {
      throw new Error('获取微信登录凭证失败')
    }
    return res.code
  })
}
