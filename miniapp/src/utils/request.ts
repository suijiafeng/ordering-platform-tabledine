import Taro from '@tarojs/taro'
import { ApiError, UNAUTHORIZED, httpErrorToResponse } from './apiError'
import { clearToken, ensureLogin, goToLogin } from './auth'
import { toast } from './toast'
import { apiBaseUrl } from './platform'

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export { ApiError } from './apiError'

export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  /** 是否携带登录 token，默认 true */
  auth?: boolean
  /** 出错时不弹 Toast，由调用方自行处理 */
  silent?: boolean
}

/**
 * 统一请求封装：
 * - 自动注入会员 token；未登录时跳转登录页（小程序与 H5 一致，不再静默登录）
 * - 收到 401 / 40101（token 过期、会员被停用或改密）：清除 token 并跳转登录页
 * - code !== 0：默认 Toast 提示并抛出 ApiError
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, auth = true, silent = false } = options
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    header.Authorization = `Bearer ${await loginOrFail()}`
  }

  let res: { statusCode: number; data: ApiResult<T> }
  try {
    res = await Taro.request<ApiResult<T>>({
      url: `${apiBaseUrl}${url}`,
      method,
      data: data as Taro.request.Option['data'],
      header,
      timeout: 10000,
    })
  } catch (e) {
    // 支付宝端非 2xx 走 fail：从错误对象里恢复出带状态码的响应，按业务错误处理
    const recovered = httpErrorToResponse<ApiResult<T>>(e)
    if (!recovered) {
      if (!silent) {
        toast('网络异常，请稍后重试')
      }
      throw new ApiError(-1, '网络异常')
    }
    res = recovered
  }

  const body = res.data
  const code = body?.code ?? -1
  if (auth && (res.statusCode === 401 || code === UNAUTHORIZED)) {
    // 会员 token 过期 / 被停用或改密：回到登录页，登录后回到当前页
    clearToken()
    goToLogin()
    throw new ApiError(UNAUTHORIZED, body?.message || '请先登录', res.statusCode)
  }
  if (code !== 0) {
    const message = body?.message || '请求失败'
    if (!silent) {
      toast(message)
    }
    throw new ApiError(code, message, res.statusCode)
  }
  return body.data
}

/** 未登录：跳转登录页并以 40101 中断本次请求（不弹「请先登录」打断用户） */
async function loginOrFail(): Promise<string> {
  try {
    return await ensureLogin()
  } catch (e) {
    goToLogin()
    throw e
  }
}
