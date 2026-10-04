export type MiniPlatform = 'WECHAT' | 'ALIPAY'

/** 当前小程序平台，对应后端 Platform 枚举 */
export function currentPlatform(): MiniPlatform {
  return process.env.TARO_ENV === 'alipay' ? 'ALIPAY' : 'WECHAT'
}

export const isAlipay = process.env.TARO_ENV === 'alipay'
