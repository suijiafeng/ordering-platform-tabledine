'use client'

/**
 * 按 Figma 设计稿实现的 UI 基元。页面只用这些组件搭建，样式集中在 app/globals.css，
 * 不要在页面里写行内样式，也不要覆盖 antd-mobile 的外观（它只用于弹层等行为类场景）。
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { currentRoutePath } from '@/lib/navigation'

/* ---------- 顶栏 ---------- */

/** 本次整页加载的落地地址：落地页没有站内上一页，返回时走 fallback */
let landingUrl: string | null = null
function isLandingPage() {
  if (typeof window === 'undefined') return true
  landingUrl ??= sessionStorage.getItem('landing_url') ?? (() => {
    const path = currentRoutePath()
    sessionStorage.setItem('landing_url', path)
    return path
  })()
  return currentRoutePath() === landingUrl
}

export function AppBar({ title, fallback = '/', right }: { title: ReactNode; fallback?: string; right?: ReactNode }) {
  const router = useRouter()
  const back = () => { if (isLandingPage()) router.replace(fallback); else router.back() }
  return (
    <header className="appbar">
      <button className="appbar-back" aria-label="返回" onClick={back}>‹</button>
      <span className="appbar-title">{title}</span>
      {right}
    </header>
  )
}

/* ---------- 按钮 ---------- */

type ButtonProps = {
  variant?: 'primary' | 'outline' | 'plain' | 'ghost'
  size?: 'lg' | 'md' | 'sm'
  block?: boolean
  loading?: boolean
  loadingLabel?: string
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function PillButton({ variant = 'primary', size = 'md', block, loading, loadingLabel = '处理中…', disabled, className = '', children, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${size}`, `btn-${variant}`, block ? 'btn-block' : '', loading ? 'btn-busy' : '', className]
  return (
    <button type="button" className={classes.filter(Boolean).join(' ')} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? loadingLabel : children}
    </button>
  )
}

/* ---------- 步进器 ---------- */

export function Stepper({ value, min = 0, max = 99, onChange, hideMinusAtMin = false, label = '数量' }: {
  value: number; min?: number; max?: number; onChange: (value: number) => void; hideMinusAtMin?: boolean; label?: string
}) {
  const showMinus = !(hideMinusAtMin && value <= min)
  return (
    <span className="stepper">
      {showMinus && <>
        <button type="button" className="step-btn step-minus" aria-label={`减少${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}><span>−</span></button>
        <span className="step-value" aria-live="polite" aria-atomic="true"><span className="sr-only">{label}：</span>{value}</span>
      </>}
      <button type="button" className="step-btn step-plus" aria-label={`增加${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><span>+</span></button>
    </span>
  )
}

/* ---------- 标签 / 卡片 / 方块 ---------- */

export type Tone = 'muted' | 'pending' | 'active' | 'success' | 'danger'
export const Tag = ({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) =>
  <span className={`tag tag-${tone}`}>{children}</span>

export const Card = ({ flush, className = '', children }: { flush?: boolean; className?: string; children: ReactNode }) =>
  <section className={`card ${flush ? 'flush' : ''} ${className}`.trim()}>{children}</section>

/** 菜品首字方块；有图时显示图片 */
export function Tile({ name, image, className = '' }: { name: string; image?: string | null; className?: string }) {
  return (
    <span className={`tile ${className}`.trim()} aria-hidden="true">
      {image ? <img src={image} alt="" loading="lazy" /> : (name.trim().charAt(0) || '餐')}
    </span>
  )
}

export const Chip = ({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) =>
  <button type="button" className={`chip ${on ? 'on' : ''}`.trim()} aria-pressed={!!on} onClick={onClick}>{children}</button>

/* ---------- 金额 ---------- */

/** 列表与详情里的价格：¥ 比数字小一号，可带「起」等后缀 */
export const Price = ({ value, suffix, className = '' }: { value: string; suffix?: string; className?: string }) =>
  <span className={`t-price ${className}`.trim()}><span className="yen">¥</span>{value}{suffix && <span className="suffix">{suffix}</span>}</span>

/* ---------- 底部固定条 ---------- */

export const BottomBar = ({ stack, lifted, children }: { stack?: boolean; lifted?: boolean; children: ReactNode }) =>
  <div className={`bottom-bar ${stack ? 'stack' : ''} ${lifted ? 'lifted' : ''}`.trim()}>{children}</div>

/* ---------- 状态 ---------- */

export const Spinner = () => <span className="spinner" aria-label="加载中" />

/**
 * 空状态 / 异常状态：灰圆图标 + 标题 + 说明 + 可选操作。
 * icon 传一个字，没传时按语义给默认字（空 / 无网络等）。
 */
export function EmptyState({ icon = '空', title, desc, action, inset }: {
  icon?: ReactNode; title: ReactNode; desc?: ReactNode; action?: ReactNode; inset?: boolean
}) {
  return (
    <div className={`empty-state ${inset ? 'inset' : ''}`.trim()}>
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && <div className="empty-act">{action}</div>}
    </div>
  )
}

/** 提示横幅：默认是品牌色的「注意」样式，用于网络异常等整页级提示 */
export const Banner = ({ children }: { children: ReactNode }) => (
  <div className="banner" role="status">
    <span className="banner-mark" aria-hidden="true">!</span>
    {children}
  </div>
)

/**
 * 骨架屏：首屏加载时顶替内容，避免白屏闪烁。只在首次加载用，下拉刷新与轮询不要用。
 * 版式要和真实内容对得上，否则比转圈更糟：
 * - media：左图右文的列表（菜单菜品行）
 * - card：一张张卡片（订单列表、订单详情、账户、流水）
 */
export function Skeleton({ rows = 3, label = '加载中…', variant = 'media' }: {
  rows?: number; label?: string; variant?: 'media' | 'card'
}) {
  return (
    <div className="skeleton" aria-busy="true" aria-label={label}>
      <div className="skeleton-label">{label}</div>
      {Array.from({ length: rows }, (_, index) => variant === 'card' ? (
        <div className="sk-card" key={index}>
          <span className="sk-line wide" />
          <span className="sk-line" />
          <span className="sk-line short" />
        </div>
      ) : (
        <div className="skeleton-row" key={index}>
          <span className="sk-tile" />
          <span>
            <span className="sk-line wide" />
            <span className="sk-line" />
          </span>
        </div>
      ))}
    </div>
  )
}

/** 行内错误：输入框下方的红色说明，配合 .field.invalid 使用 */
export const FieldError = ({ children }: { children: ReactNode }) => <div className="field-error">{children}</div>

/* ---------- 图标（内联 SVG，避免 emoji 跨平台不一致） ---------- */

export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
  </svg>
)
export const CartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H7" />
    <circle cx="9.5" cy="20" r="1.3" /><circle cx="17.5" cy="20" r="1.3" />
  </svg>
)
export const PersonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
  </svg>
)
export const CheckIcon = () => (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)
