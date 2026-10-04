import Taro from '@tarojs/taro'
import { ApiError, httpErrorToResponse } from './apiError'
import { getLoginCode } from './login'
import { currentPlatform } from './platform'

const TOKEN_KEY = 'customer_token'
const TOKEN_EXPIRE_KEY = 'customer_token_expire_at'
/** 提前 60 秒视为过期，避免请求途中失效 */
const EXPIRE_MARGIN_MS = 60 * 1000

let loginPromise: Promise<string> | null = null

export function getToken(): string | null {
  const token = Taro.getStorageSync<string>(TOKEN_KEY)
  const expireAt = Number(Taro.getStorageSync(TOKEN_EXPIRE_KEY) || 0)
  if (!token || Date.now() > expireAt - EXPIRE_MARGIN_MS) {
    return null
  }
  return token
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync(TOKEN_EXPIRE_KEY)
}

interface LoginResult {
  token: string
  expiresIn: number
  customerId: number
}

/**
 * 确保已登录并返回 token。并发调用只会发起一次登录。
 * @param force 忽略本地 token，强制重新登录（服务端返回 401 时使用）
 */
export function ensureLogin(force = false): Promise<string> {
  if (!force) {
    const cached = getToken()
    if (cached) {
      return Promise.resolve(cached)
    }
  }
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => {
      loginPromise = null
    })
  }
  return loginPromise
}

async function doLogin(): Promise<string> {
  let code: string
  try {
    code = await getLoginCode()
  } catch (e) {
    throw new ApiError(-1, (e as Error)?.message || '获取登录凭证失败')
  }
  type LoginBody = { code: number; message: string; data: LoginResult }
  let res: { statusCode: number; data: LoginBody }
  try {
    res = await Taro.request<LoginBody>({
      url: `${process.env.TARO_APP_API_BASE}/api/v1/c/auth/login`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { platform: currentPlatform(), code },
      timeout: 10000,
    })
  } catch (e) {
    const recovered = httpErrorToResponse<LoginBody>(e)
    if (!recovered) {
      throw new ApiError(-1, '网络异常，登录失败')
    }
    res = recovered
  }
  const body = res.data
  if (res.statusCode !== 200 || !body || body.code !== 0) {
    // 带上后端业务码（40103 停用 / 40104 换取失败 / 42901 限流），调用方据此提示与止损
    throw new ApiError(body?.code ?? -1, body?.message || '登录失败', res.statusCode)
  }
  Taro.setStorageSync(TOKEN_KEY, body.data.token)
  Taro.setStorageSync(TOKEN_EXPIRE_KEY, Date.now() + body.data.expiresIn * 1000)
  return body.data.token
}
