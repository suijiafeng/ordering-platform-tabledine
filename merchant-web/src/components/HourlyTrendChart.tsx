import { useState } from 'react'
import { Typography, theme as antdTheme } from 'antd'
import { formatYuan } from '../utils/money'
import type { HourPoint } from '../pages/dashboard/dashboardData'

interface Props {
  today: HourPoint[]
  yesterday: HourPoint[]
  metric: 'amount' | 'orders'
  /** 当前小时：画成斜线柱（进行中），之后的小时不画今日柱 */
  nowHour: number
  height?: number
  width?: number
}

/**
 * 今日分时趋势（手写 SVG，不引图表库）：今日实色柱 + 昨日虚线，当前小时斜线填充，悬停显示两天对比。
 * width 是 viewBox 逻辑宽度，按容器等比缩放。
 */
export default function HourlyTrendChart({ today, yesterday, metric, nowHour, height = 240, width = 760 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const { token } = antdTheme.useToken()
  const val = (p: HourPoint | undefined) => (p ? (metric === 'amount' ? p.amount : p.orders) : 0)
  const fmt = (v: number) => (metric === 'amount' ? formatYuan(v) : `${v} 单`)
  const padL = 52
  const padR = 12
  const padT = 24
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const dataMax = Math.max(0, ...today.map(val), ...yesterday.map(val))
  const empty = dataMax === 0
  // 刻度取 4 等分且每格是整数（金额按整元、订单按整单），避免出现「¥0 ¥0 ¥0」或「0 0 1 1 1」
  const step = (metric === 'amount' ? 100 : 1) * 4
  const niceMax = Math.max(step, Math.ceil(niceCeil(Math.max(1, dataMax)) / step) * step)
  const slot = plotW / Math.max(1, today.length)
  const barW = Math.min(28, slot * 0.5)
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH
  const ticks = (empty ? [0] : [0, 0.25, 0.5, 0.75, 1]).map((f) => niceMax * f)
  const cx = (i: number) => padL + slot * i + slot / 2
  const yPath = yesterday.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(val(p)).toFixed(1)}`).join(' ')
  const tickLabel = (t: number) => (metric === 'amount' ? `¥${Math.round(t / 100)}` : String(Math.round(t)))
  const hatchId = 'td-hatch'

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={metric === 'amount' ? '今日分时实收（对比昨日）' : '今日分时订单数（对比昨日）'}>
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={token.colorPrimaryBg} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={token.colorPrimary} strokeWidth="3" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={token.colorSplit} strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary} style={{ fontVariantNumeric: 'tabular-nums' }}>{tickLabel(t)}</text>
          </g>
        ))}
        {today.map((p, i) => {
          const v = val(p)
          const h = Math.max(0, (v / niceMax) * plotH)
          const top = y(v)
          const r = Math.min(4, h / 2)
          const x = cx(i)
          const future = p.hour > nowHour
          const current = p.hour === nowHour
          return (
            <g key={p.hour} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x - slot / 2} y={padT} width={slot} height={plotH} fill={hover === i ? token.colorFillAlter : 'transparent'} />
              {!future && h > 0 && (
                <path
                  d={`M${x - barW / 2},${padT + plotH} V${top + r} Q${x - barW / 2},${top} ${x - barW / 2 + r},${top} H${x + barW / 2 - r} Q${x + barW / 2},${top} ${x + barW / 2},${top + r} V${padT + plotH} Z`}
                  fill={current ? `url(#${hatchId})` : token.colorPrimary}
                />
              )}
              {current && (
                <text x={x} y={Math.min(top, padT + plotH) - 6} textAnchor="middle" fontSize={11} fill={token.colorPrimary}>现在</text>
              )}
              <text x={x} y={height - 8} textAnchor="middle" fontSize={11} fill={hover === i ? token.colorText : token.colorTextTertiary}>{`${p.hour}:00`}</text>
            </g>
          )
        })}
        {empty && (
          <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={13} fill={token.colorTextTertiary}>
            {metric === 'amount' ? '今天和昨天同时段还没有收入' : '今天和昨天同时段还没有订单'}
          </text>
        )}
        {!empty && yesterday.length > 1 && (
          <path d={yPath} fill="none" stroke={token.colorTextTertiary} strokeWidth={1.5} strokeDasharray="4 4" pointerEvents="none" />
        )}
      </svg>
      {hover !== null && today[hover] && (
        <div
          style={{
            position: 'absolute',
            left: `${(cx(hover) / width) * 100}%`,
            top: 0,
            transform: `translate(${hover > today.length / 2 ? '-105%' : '5%'}, 0)`,
            background: token.colorBgElevated,
            border: `1px solid ${token.colorSplit}`,
            borderRadius: 8,
            boxShadow: token.boxShadowSecondary,
            fontVariantNumeric: 'tabular-nums',
            padding: '8px 12px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <Typography.Text type="secondary">{`${today[hover].hour}:00–${today[hover].hour + 1}:00`}</Typography.Text>
          <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorPrimary, marginRight: 6 }} />今日 <b>{fmt(val(today[hover]))}</b></div>
          <div><span style={{ display: 'inline-block', width: 8, height: 2, background: token.colorTextTertiary, marginRight: 6, verticalAlign: 'middle' }} />昨日 {fmt(val(yesterday[hover]))}</div>
        </div>
      )}
    </div>
  )
}

function niceCeil(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10
  return m * pow
}
