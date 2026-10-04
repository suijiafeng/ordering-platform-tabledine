import { request } from '../utils/request'
import type { DashboardToday, UnconfirmedPayment } from './types'

export const fetchDashboard = () => request<DashboardToday>({ url: '/api/v1/m/dashboard/today' })

/** 本地已关闭、渠道超过 1 天无法确认的支付单（需人工到渠道商户平台核对） */
export const fetchUnconfirmedPayments = () => request<UnconfirmedPayment[]>({ url: '/api/v1/m/payments/unconfirmed', silent: true })

/** 导出 CSV：以 Blob 下载（需要携带 token，不能用 <a href> 直接下） */
export async function exportReport(from: string, to: string): Promise<void> {
  const blob = await request<Blob>({ url: '/api/v1/m/reports/export', params: { from, to }, responseType: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders-${from}_${to}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
