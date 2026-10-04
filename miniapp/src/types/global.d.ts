/// <reference types="@tarojs/taro" />

declare module '*.png'
declare module '*.css'

declare namespace NodeJS {
  interface ProcessEnv {
    TARO_ENV: 'weapp' | 'alipay' | 'swan' | 'tt' | 'qq' | 'jd' | 'h5' | 'rn'
    /** 后端地址，来自 .env.development / .env.production */
    TARO_APP_API_BASE: string
  }
}

/** 支付宝小程序全局对象（仅在 TARO_ENV === 'alipay' 分支中使用） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const my: any
