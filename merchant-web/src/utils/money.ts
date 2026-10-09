/** 金额工具：后端统一以「分」为单位，界面以「元」展示和输入 */

export function fenToYuan(fen: number | null | undefined): number {
  return fen == null ? 0 : fen / 100
}

export function yuanToFen(yuan: number | null | undefined): number {
  return yuan == null ? 0 : Math.round(yuan * 100)
}

export function formatYuan(fen: number | null | undefined): string {
  return `¥${fenToYuan(fen).toFixed(2)}`
}

/** 加价展示：+3.00 / -1.00 / 不加价 */
export function formatDelta(fen: number): string {
  if (!fen) {
    return ''
  }
  return `${fen > 0 ? '+' : '-'}${(Math.abs(fen) / 100).toFixed(2)}`
}
