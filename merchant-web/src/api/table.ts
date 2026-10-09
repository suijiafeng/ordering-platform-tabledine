import { request } from '../utils/request'
import type { TableItem } from './types'

export const listTables = () => request<TableItem[]>({ url: '/api/v1/m/tables' })

export const createTable = (code: string) =>
  request<TableItem>({ url: '/api/v1/m/tables', method: 'POST', data: { code } })

export const createTablesBatch = (data: { prefix: string; from: number; to: number }) =>
  request<TableItem[]>({ url: '/api/v1/m/tables/batch', method: 'POST', data })

export const updateTable = (id: number, data: { code: string; status: number }) =>
  request<TableItem>({ url: `/api/v1/m/tables/${id}`, method: 'PUT', data })

export const deleteTable = (id: number) => request<void>({ url: `/api/v1/m/tables/${id}`, method: 'DELETE' })

export const resetTableQr = (id: number) =>
  request<TableItem>({ url: `/api/v1/m/tables/${id}/reset-qr`, method: 'POST' })
