import { request } from '../utils/request'
import type { StaffItem, StaffRole } from './types'

export const listStaff = () => request<StaffItem[]>({ url: '/api/v1/m/staff' })

/** role：STAFF 前厅（默认）/ KITCHEN 后厨 */
export const createStaff = (data: { username: string; name: string; password: string; role: Exclude<StaffRole, 'OWNER'> }) =>
  request<StaffItem>({ url: '/api/v1/m/staff', method: 'POST', data })

/** password 非空时重置密码；role 变化时调整角色。两者都会让该员工重新登录 */
export const updateStaff = (id: number, data: { name: string; password?: string; role?: Exclude<StaffRole, 'OWNER'> }) =>
  request<StaffItem>({ url: `/api/v1/m/staff/${id}`, method: 'PUT', data })

export const setStaffEnabled = (id: number, enabled: boolean) =>
  request<StaffItem>({ url: `/api/v1/m/staff/${id}/status`, method: 'PATCH', data: { enabled } })

export const changeOwnPassword = (oldPassword: string, newPassword: string) =>
  request<void>({ url: '/api/v1/m/staff/me/password', method: 'PUT', data: { oldPassword, newPassword } })
