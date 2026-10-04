import Taro from '@tarojs/taro'
import { ApiError, UNAUTHORIZED, httpErrorToResponse } from './apiError'
import { clearToken, ensureLogin } from './auth'
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
 * - 自动注入 customer token（未登录时先静默登录）
 * - 收到 401 / 40101：清除 token、重新静默登录后重放一次
 * - code !== 0：默认 Toast 提示并抛出 ApiError
 */
export async function request<T>(options: RequestOptions, retried = false): Promise<T> {
  const { url, method = 'GET', data, auth = true, silent = false } = options
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    header.Authorization = `Bearer ${await loginOrFail(false, silent)}`
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
  if (auth && !retried && (res.statusCode === 401 || code === UNAUTHORIZED)) {
    clearToken()
    await loginOrFail(true, silent)
    return request<T>(options, true)
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

/**
 * 静默登录；失败（顾客被停用 40103、换取凭证失败 40104、限流 42901）时按业务错误提示并抛 ApiError，
 * 否则各页面会在没有任何提示的情况下卡在「重试中」或显示空列表。
 */
async function loginOrFail(force: boolean, silent: boolean): Promise<string> {
  try {
    return await ensureLogin(force)
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(-1, (e as Error)?.message || '登录失败')
    if (!silent) {
      toast(err.message)
    }
    throw err
  }
}
