import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { getMessage } from './antdStatic'
import type { ApiResult, StaffTokenResponse } from '../api/types'
import { useAuthStore } from '../store/auth'

export class ApiError extends Error {
  constructor(public code: number, msg: string, public status?: number) {
    super(msg)
  }
}

const UNAUTHORIZED = 40101

const http = axios.create({ baseURL: '/', timeout: 15000 })

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 同一时刻只发起一次刷新，其他 401 请求等待结果 */
let refreshing: Promise<string> | null = null

const REFRESH_LOCK = 'merchant-auth-refresh'

/**
 * 跨标签页串行化刷新：refresh token 只能用一次，两个标签页同时拿同一个去续期，后到的那个必然失败。
 * 支持 Web Locks 的浏览器用锁排队，排到时先读 localStorage，多半能直接用别的标签页换好的新 token；
 * 不支持的浏览器退化为不加锁，由 doRefresh 里「退出前再核对存储」兜底。
 */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  // Web Locks 的回调类型会把 Promise<T> 再包一层，这里按实际结果断言
  return locks ? (locks.request(REFRESH_LOCK, fn) as Promise<T>) : fn()
}

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = withRefreshLock(doRefresh).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function doRefresh(): Promise<string> {
  // 先看 localStorage：另一个标签页可能刚续期过（refresh token 只能用一次），直接复用它的新 token
  const store = useAuthStore.getState()
  const staleAccess = store.accessToken
  if (store.syncFromStorage() && useAuthStore.getState().accessToken && useAuthStore.getState().accessToken !== staleAccess) {
    return useAuthStore.getState().accessToken as string
  }
  const { refreshToken, setTokens, logout } = useAuthStore.getState()
  if (!refreshToken) {
    throw new ApiError(UNAUTHORIZED, '登录已失效')
  }
  try {
    // 续期请求也要有超时，否则所有等待续期的请求会一起无限悬挂
    const res = await axios.post<ApiResult<StaffTokenResponse>>(
      '/api/v1/m/auth/refresh',
      { refreshToken },
      { timeout: 15000 },
    )
    if (res.data.code !== 0) {
      throw new ApiError(res.data.code, res.data.message)
    }
    setTokens(res.data.data)
    return res.data.data.accessToken
  } catch (e) {
    // 只有 refresh token 本身被拒（401 / 401xx）才退出登录；网络超时、5xx 不代表登录失效，保留登录态，下次请求再续期
    const rejected = (e instanceof ApiError && e.code >= 40100 && e.code < 40200)
      || (axios.isAxiosError(e) && e.response?.status === 401)
    if (rejected) {
      // 退出前再核对一次存储：另一个标签页可能刚用同一个 refresh token 续期成功并写入了新 token，
      // 这时失败的是我们这份过期副本，不能把对方刚存好的登录态清掉，改为采用它
      useAuthStore.getState().syncFromStorage()
      const latest = useAuthStore.getState()
      if (latest.refreshToken && latest.refreshToken !== refreshToken && latest.accessToken) {
        return latest.accessToken
      }
      logout()
    }
    throw e
  }
}

export interface RequestOptions extends AxiosRequestConfig {
  /** 出错时不弹全局提示 */
  silent?: boolean
}

/**
 * 统一请求：返回 data 字段；code !== 0 抛 ApiError。
 * access token 失效时自动用 refresh token 续期并重放一次；续期失败则退出登录。
 */
export async function request<T>(options: RequestOptions, retried = false): Promise<T> {
  const { silent, ...config } = options
  try {
    const res = await http.request<ApiResult<T>>(config)
    if (config.responseType === 'blob') {
      // 文件下载：成功时直接返回 Blob；后端出错时响应体是 JSON，转成 ApiError
      const blob = res.data as unknown as Blob
      if (blob.type.includes('json')) {
        const body = JSON.parse(await blob.text()) as ApiResult<unknown>
        throw new ApiError(body.code, body.message, res.status)
      }
      return blob as unknown as T
    }
    if (res.data.code !== 0) {
      throw new ApiError(res.data.code, res.data.message, res.status)
    }
    return res.data.data
  } catch (e) {
    let err = normalize(e)
    if (config.responseType === 'blob' && e instanceof AxiosError && e.response?.data instanceof Blob) {
      // 非 2xx 时 axios 仍按 blob 解析响应体，后端的 JSON 错误（含 40101）要从 Blob 里读出来
      err = (await blobToApiError(e.response.data, e.response.status)) ?? err
    }
    const isAuthCall = String(config.url ?? '').includes('/auth/')
    if (err.code === UNAUTHORIZED && !retried && !isAuthCall) {
      try {
        await refreshAccessToken()
      } catch (refreshErr) {
        // 只有 refresh token 被拒（已退出登录）才是「登录失效」；续期请求超时 / 5xx 时仍保持登录，
        // 按网络异常提示，下次请求会再续期。两种提示都用固定 key：并发的多个 401 共用一次续期，只提示一次
        const refreshError = normalize(refreshErr)
        const sessionLost = !useAuthStore.getState().accessToken
          || (refreshError.code >= 40100 && refreshError.code < 40200)
        if (!silent) {
          if (sessionLost) {
            getMessage()?.warning({ content: '登录已失效，请重新登录', key: 'session-expired' })
          } else {
            getMessage()?.error({ content: refreshError.message, key: 'refresh-failed' })
          }
        }
        throw sessionLost ? err : refreshError
      }
      return request<T>(options, true)
    }
    if (!silent) {
      getMessage()?.error(err.message)
    }
    throw err
  }
}

async function blobToApiError(blob: Blob, status: number): Promise<ApiError | null> {
  if (!blob.type.includes('json')) {
    return null
  }
  try {
    const body = JSON.parse(await blob.text()) as Partial<ApiResult<unknown>>
    if (typeof body.code === 'number') {
      return new ApiError(body.code, body.message || '请求失败', status)
    }
  } catch {
    // 不是合法 JSON，走通用错误
  }
  return null
}

function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e
  }
  if (e instanceof AxiosError) {
    const body = e.response?.data as Partial<ApiResult<unknown>> | undefined
    if (body && typeof body.code === 'number') {
      return new ApiError(body.code, body.message || '请求失败', e.response?.status)
    }
    const status = e.response?.status
    if (status && status >= 500) {
      // 后端未启动 / 代理 502 等：响应体不是统一结构，给用户可理解的提示
      return new ApiError(-1, '服务暂不可用，请稍后重试', status)
    }
    return new ApiError(-1, status ? `请求失败（${status}）` : '网络异常，请稍后重试', status)
  }
  return new ApiError(-1, '请求失败')
}
