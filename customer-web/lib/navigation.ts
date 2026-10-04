/**
 * 应用部署在 /h5 下（next.config.ts 的 basePath）。router.push / replace 会自动加前缀，
 * 但 location.assign 和从 location.pathname 读出的路径不会，需要用下面两个函数转换。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const TABLE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** 返回菜单时只携带已校验格式的桌码，避免无桌码页面恢复到旧桌台。 */
export function menuPath(qrToken?: string | null): string {
  return qrToken && TABLE_TOKEN_PATTERN.test(qrToken) ? `/?token=${encodeURIComponent(qrToken)}` : '/'
}

/** 站内路由路径（如 /login）→ 浏览器地址（如 /h5/login），用于 location.assign */
export const toBrowserUrl = (routePath: string) => `${BASE_PATH}${routePath}`

/** 当前页面的站内路由路径（去掉 basePath），用于登录后回跳 */
export function currentRoutePath(): string {
  const path = location.pathname.startsWith(BASE_PATH) ? location.pathname.slice(BASE_PATH.length) || '/' : location.pathname
  return `${path}${location.search}`
}

/** 登录后的回跳地址只允许站内路径，防止 ?redirect=https://… 被用来跳到外站 */
export function safeRedirect(value: string | null, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
