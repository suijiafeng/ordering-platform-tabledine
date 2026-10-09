import { request } from '../utils/request'
import type { AuditLogItem, PageResult } from './types'

export interface AuditQuery {
  from?: string
  to?: string
  actorType?: string
  actorId?: number
  category?: string
  opType?: string
  success?: boolean
  keyword?: string
  page: number
  pageSize: number
}

/** 审计日志查询（仅店主）；查询本身也会被记录 */
export const listAuditLogs = (params: AuditQuery) => request<PageResult<AuditLogItem>>({ url: '/api/v1/m/audit-logs', params })
