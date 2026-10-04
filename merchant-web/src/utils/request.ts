import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { message } from 'antd'
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
        const res = await axios.post<ApiResult<StaffTokenResponse>>('/api/v1/m/auth/refresh', { refreshToken })
        if (res.data.code !== 0) {
          throw new ApiError(res.data.code, res.data.message)
        }
        setTokens(res.data.data)
        return res.data.data.accessToken
      } catch (e) {
        logout()
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
    if (res.data.code !== 0) {
      throw new ApiError(res.data.code, res.data.message, res.status)
    }
    return res.data.data
  } catch (e) {
    const err = normalize(e)
    const isAuthCall = String(config.url ?? '').includes('/auth/')
    if (err.code === UNAUTHORIZED && !retried && !isAuthCall) {
      try {
        await refreshAccessToken()
      } catch {
        if (!silent) {
          message.warning('登录已失效，请重新登录')
        }
        throw err
      }
      return request<T>(options, true)
    }
    if (!silent) {
      message.error(err.message)
    }
    throw err
  }
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
    return new ApiError(-1, e.response ? `请求失败（${e.response.status}）` : '网络异常，请稍后重试', e.response?.status)
  }
  return new ApiError(-1, '请求失败')
}
