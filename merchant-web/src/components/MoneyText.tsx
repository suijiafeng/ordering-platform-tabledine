import { Typography } from 'antd'
import { formatYuan } from '../utils/money'

/** 金额展示：统一字体与颜色 */
export default function MoneyText({ fen, strong, type }: { fen: number | null | undefined; strong?: boolean; type?: 'secondary' | 'danger' | 'success' }) {
  return (
    <Typography.Text strong={strong} type={type} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatYuan(fen)}
    </Typography.Text>
  )
}
