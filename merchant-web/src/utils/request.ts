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

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    const { refreshToken, setTokens, logout } = useAuthStore.getState()
    refreshing = (async () => {
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
          logout()
        }
        throw e
      }
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
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
      } catch {
        // 续期失败只提示一次：多个并发 401 共用同一次刷新，避免弹出多条重复提示
        if (!silent) {
          getMessage()?.warning({ content: '登录已失效，请重新登录', key: 'session-expired' })
        }
        throw err
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
