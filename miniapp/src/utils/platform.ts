export type MiniPlatform = 'WECHAT' | 'ALIPAY'

/** 当前小程序平台，对应后端 Platform 枚举 */
export function currentPlatform(): MiniPlatform {
  return process.env.TARO_ENV === 'alipay' ? 'ALIPAY' : 'WECHAT'
}

export const isAlipay = process.env.TARO_ENV === 'alipay'

export const isH5 = process.env.TARO_ENV === 'h5'

/** H5 同源部署：开发由 devServer 代理，生产由 Nginx 代理。 */
export const apiBaseUrl = isH5 ? '' : process.env.TARO_APP_API_BASE
