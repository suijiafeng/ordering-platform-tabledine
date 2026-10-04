import Taro from '@tarojs/taro'
import { clearToken, ensureLogin } from './auth'

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export class ApiError extends Error {
  constructor(public code: number, message: string, public statusCode?: number) {
    super(message)
  }
}

export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  /** 是否携带登录 token，默认 true */
  auth?: boolean
  /** 出错时不弹 Toast，由调用方自行处理 */
  silent?: boolean
}

const UNAUTHORIZED = 40101

/**
 * 统一请求封装：
 * - 自动注入 customer token（未登录时先静默登录）
 * - 收到 401 / 40101：清除 token、重新静默登录后重放一次
 * - code !== 0：默认 Toast 提示并抛出 ApiError
 */
export async function request<T>(options: RequestOptions, retried = false): Promise<T> {
  const { url, method = 'GET', data, auth = true, silent = false } = options
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    header.Authorization = `Bearer ${await ensureLogin()}`
  }

  let res: Taro.request.SuccessCallbackResult<ApiResult<T>>
  try {
    res = await Taro.request<ApiResult<T>>({
      url: `${process.env.TARO_APP_API_BASE}${url}`,
      method,
      data: data as Taro.request.Option['data'],
      header,
      timeout: 10000,
    })
  } catch (e) {
    if (!silent) {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    }
    throw new ApiError(-1, '网络异常')
  }

  const body = res.data
  const code = body?.code ?? -1
  if (auth && !retried && (res.statusCode === 401 || code === UNAUTHORIZED)) {
    clearToken()
    await ensureLogin(true)
    return request<T>(options, true)
  }
  if (code !== 0) {
    const message = body?.message || '请求失败'
    if (!silent) {
      Taro.showToast({ title: message, icon: 'none' })
    }
    throw new ApiError(code, message, res.statusCode)
  }
  return body.data
}
