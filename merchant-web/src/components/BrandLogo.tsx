import { Typography, theme as antdTheme } from 'antd'
import { BRAND } from '../config/brand'

interface Props {
  size?: number
  /** 是否显示名称；侧栏折叠时只显示图标 */
  showName?: boolean
  /** 名称下方显示副标题 */
  showSubtitle?: boolean
}

/** 品牌标识：Logo + 名称。Logo 内联 SVG（与 public/logo.svg 一致），避免额外请求且随主题清晰 */
export default function BrandLogo({ size = 28, showName = true, showSubtitle = false }: Props) {
  const { token } = antdTheme.useToken()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, lineHeight: 1.2 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flexShrink: 0 }}>
        <rect width="64" height="64" rx="14" fill="#FA8C16" />
        <path d="M41 13 L49 21 M45 11 L53 19" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M12 31 H52 C52 42.5 43 50 32 50 C21 50 12 42.5 12 31 Z" fill="#fff" />
        <rect x="24" y="50" width="16" height="4" rx="2" fill="#fff" />
        <path d="M11 11 H19 M11 11 V19" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".9" />
      </svg>
      {showName && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: size >= 40 ? 22 : 16, whiteSpace: 'nowrap', letterSpacing: 1 }}>
            {BRAND.name}
          </Typography.Text>
          {showSubtitle && (
            <span style={{ fontSize: 12, color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>{BRAND.subtitle}</span>
          )}
        </span>
      )}
    </span>
  )
}
