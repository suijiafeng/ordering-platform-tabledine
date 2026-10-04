import { useState } from 'react'
import { Typography, theme as antdTheme } from 'antd'
import { formatYuan } from '../utils/money'

interface Point {
  date: string
  netIncome: number
  orderCount: number
}

/**
 * 近 7 天实收柱状图（单一序列，无需图例）：细柱、顶部 4px 圆角、悬停提示、最高值直接标注。
 * 同页提供表格视图作为无障碍 / 数据查看入口。
 */
/** width 是 viewBox 逻辑宽度：窄屏传小一点，缩放后文字才不会太小；label 用于无障碍描述 */
export default function DailyBarChart({ data, height = 180, width = 640, label = '每日实收' }: { data: Point[]; height?: number; width?: number; label?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const { token } = antdTheme.useToken()
  const padL = 56
  const padR = 16
  const padT = 20
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const max = Math.max(1, ...data.map((d) => d.netIncome))
  const niceMax = niceCeil(max)
  const gap = 2
  const slot = plotW / Math.max(1, data.length)
  const barW = Math.min(36, slot * 0.6)
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH
  const ticks = [0, niceMax / 2, niceMax]
  const maxIdx = data.reduce((best, d, i) => (d.netIncome > (data[best]?.netIncome ?? -1) ? i : best), 0)
  // 区间长（如 3 个月）时横轴日期按步长抽样显示，避免互相重叠；悬停时仍显示该柱的日期
  const labelStep = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 48))))

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={token.colorSplit} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>¥{(t / 100).toFixed(0)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2
          const h = Math.max(0, (d.netIncome / niceMax) * plotH)
          const top = y(d.netIncome)
          const r = Math.min(4, h / 2)
          const active = hover === i
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* 命中区域大于柱体 */}
              <rect x={cx - slot / 2 + gap} y={padT} width={slot - gap * 2} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${padT + plotH} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${padT + plotH} Z`}
                  fill={active ? token.colorPrimaryActive : token.colorPrimary}
                />
              )}
              {(i === maxIdx && d.netIncome > 0) && !active && (
                <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fill={token.colorTextSecondary}>{formatYuan(d.netIncome)}</text>
              )}
              {(active || i % labelStep === 0) && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={active ? token.colorText : token.colorTextTertiary}>{d.date.slice(5)}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          style={{
            position: 'absolute',
            left: `${((padL + slot * hover + slot / 2) / width) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -100%)',
            background: token.colorBgElevated,
            border: `1px solid ${token.colorSplit}`,
            borderRadius: 6,
            boxShadow: token.boxShadowSecondary,
            padding: '6px 10px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <div><Typography.Text type="secondary">{data[hover].date}</Typography.Text></div>
          <div>实收 <b>{formatYuan(data[hover].netIncome)}</b> · {data[hover].orderCount} 单</div>
        </div>
      )}
    </div>
  )
}

function niceCeil(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return m * pow
}
