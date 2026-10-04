import { request } from '../utils/request'
import type { StaffItem } from './types'

export const listStaff = () => request<StaffItem[]>({ url: '/api/v1/m/staff' })

export const createStaff = (data: { username: string; name: string; password: string }) =>
  request<StaffItem>({ url: '/api/v1/m/staff', method: 'POST', data })

/** password 非空时重置密码 */
export const updateStaff = (id: number, data: { name: string; password?: string }) =>
  request<StaffItem>({ url: `/api/v1/m/staff/${id}`, method: 'PUT', data })

export const setStaffEnabled = (id: number, enabled: boolean) =>
  request<StaffItem>({ url: `/api/v1/m/staff/${id}/status`, method: 'PATCH', data: { enabled } })

export const changeOwnPassword = (oldPassword: string, newPassword: string) =>
  request<void>({ url: '/api/v1/m/staff/me/password', method: 'PUT', data: { oldPassword, newPassword } })
