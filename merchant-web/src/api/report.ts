import { request } from '../utils/request'
import type { DashboardToday, ReportSummary } from './types'

export const fetchDashboard = () => request<DashboardToday>({ url: '/api/v1/m/dashboard/today' })

/** 区间统计：from / to 为 yyyy-MM-dd，最多 92 天 */
export const fetchReportSummary = (from: string, to: string) =>
  request<ReportSummary>({ url: '/api/v1/m/reports/summary', params: { from, to } })


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
