/**
 * 从启动参数中解析桌码 token（双端差异集中在这里）。
 *
 * 桌码内容为普通 HTTPS 链接：https://<域名>/q/<qrToken>
 * - 微信「扫普通链接二维码打开小程序」：链接经 encodeURIComponent 后放在 query.q
 * - 支付宝「关联普通二维码」：链接放在 query.qrCode
 * - H5：桌码链接本身就是页面地址（Nginx 把 /q/<token> 指向 H5 应用），从 location.pathname 解析；
 *   开发时也可用 ?token=dev-table-a1
 * - 开发调试：可直接在编译模式里配置 query 参数 token=dev-table-a1
 */
const TOKEN_PATTERN = /\/q\/([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function extractQrToken(query?: Record<string, unknown>): string | null {
  const direct = asString(query?.token)
  if (direct && RAW_TOKEN_PATTERN.test(direct)) {
    return direct
  }
  const link = asString(query?.q) ?? asString(query?.qrCode)
  if (link) {
    return parseTokenFromLink(safeDecode(link))
  }
  if (process.env.TARO_ENV === 'h5' && typeof window !== 'undefined') {
    return parseTokenFromLink(window.location.pathname)
  }
  return null
}

export function parseTokenFromLink(link: string): string | null {
  const match = TOKEN_PATTERN.exec(link)
  return match ? match[1] : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
