/** 金额：后端以「分」为单位 */
export function formatYuan(fen: number): string {
  const yuan = fen / 100
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
}

/** 后端返回的图片是站内相对路径（/uploads/...），需要拼接后端地址 */
export function imageUrl(path: string | null | undefined): string {
  if (!path) {
    return ''
  }
  return path.startsWith('/') ? `${process.env.TARO_APP_API_BASE}${path}` : path
}
