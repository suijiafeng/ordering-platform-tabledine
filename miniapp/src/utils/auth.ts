import Taro from '@tarojs/taro'
import { ApiError, UNAUTHORIZED, httpErrorToResponse } from './apiError'
import { getLoginCode } from './login'
import { apiBaseUrl, currentPlatform, isH5 } from './platform'

const TOKEN_KEY = 'customer_token'
const TOKEN_EXPIRE_KEY = 'customer_token_expire_at'
/** 提前 60 秒视为过期，避免请求途中失效 */
const EXPIRE_MARGIN_MS = 60 * 1000

export const LOGIN_PAGE = '/pages/login/index'

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

/** H5：是否已登录会员账号（小程序端总是能静默登录，不需要判断） */
export function isLoggedIn(): boolean {
  return getToken() !== null
}

interface LoginResult {
  token: string
  expiresIn: number
  customerId: number
}

/**
 * 确保已登录并返回 token。并发调用只会发起一次登录。
 * - 小程序：没有可用 token 时静默登录
 * - H5：没有可用 token 时直接抛 40101，由请求层跳转登录页（浏览器没有静默登录）
 * @param force 忽略本地 token，强制重新登录（服务端返回 401 时使用）
 */
export function ensureLogin(force = false): Promise<string> {
  if (!force) {
    const cached = getToken()
    if (cached) {
      return Promise.resolve(cached)
    }
  }
  if (isH5) {
    clearToken()
    return Promise.reject(new ApiError(UNAUTHORIZED, '请先登录', 401))
  }
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => {
      loginPromise = null
    })
  }
  return loginPromise
}

/** H5 会员密码登录：成功后保存 token */
export async function passwordLogin(phone: string, password: string): Promise<void> {
  const body = await postLogin('/api/v1/c/auth/password-login', { phone, password })
  saveToken(body)
}

/** 退出登录（只清本地 token） */
export function logout() {
  clearToken()
}

/**
 * H5：跳到登录页，登录成功后回到 redirect（当前页面路径，含参数）。
 * 已在登录页时不重复跳转。
 */
export function goToLogin(redirect?: string) {
  const pages = Taro.getCurrentPages()
  const top = pages[pages.length - 1]
  if (top && String(top.route ?? '').includes('pages/login')) {
    return
  }
  const target = redirect ?? currentPagePath()
  void Taro.navigateTo({ url: `${LOGIN_PAGE}?redirect=${encodeURIComponent(target)}` })
}

/** 当前页面路径（含 query），用于登录后跳回 */
export function currentPagePath(): string {
  const pages = Taro.getCurrentPages()
  const top = pages[pages.length - 1] as { route?: string; options?: Record<string, string> } | undefined
  if (!top?.route) {
    return '/pages/index/index'
  }
  const query = Object.entries(top.options ?? {})
    .filter(([k]) => k !== 'redirect')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `/${top.route}${query ? `?${query}` : ''}`
}

async function doLogin(): Promise<string> {
  let code: string
  try {
    code = await getLoginCode()
  } catch (e) {
    throw new ApiError(-1, (e as Error)?.message || '获取登录凭证失败')
  }
  const body = await postLogin('/api/v1/c/auth/login', { platform: currentPlatform(), code })
  return saveToken(body)
}

type LoginBody = { code: number; message: string; data: LoginResult }

async function postLogin(path: string, data: Record<string, string>): Promise<LoginBody> {
  let res: { statusCode: number; data: LoginBody }
  try {
    res = await Taro.request<LoginBody>({
      url: `${apiBaseUrl}${path}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data,
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
    // 带上后端业务码（40102 密码错误 / 40103 停用或锁定 / 40104 换取失败 / 42901 限流），调用方据此提示与止损
    throw new ApiError(body?.code ?? -1, body?.message || '登录失败', res.statusCode)
  }
  return body
}

function saveToken(body: LoginBody): string {
  Taro.setStorageSync(TOKEN_KEY, body.data.token)
  Taro.setStorageSync(TOKEN_EXPIRE_KEY, Date.now() + body.data.expiresIn * 1000)
  return body.data.token
}
