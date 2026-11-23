import { theme as antdTheme } from 'antd'

/** KPI 卡片右上角的迷你折线（近 7 天），只做趋势示意，不带坐标轴 */
export default function Sparkline({ values, color, width = 72, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const { token } = antdTheme.useToken()
  // 少于两个点或全是 0（新店）时不画，避免一条误导的平线
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ flex: 'none' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color ?? token.colorPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
