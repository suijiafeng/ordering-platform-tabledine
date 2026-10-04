import { request } from '../utils/request'
import type { StaffProfile, StaffTokenResponse, StoreDetail } from './types'

export function login(username: string, password: string) {
  return request<StaffTokenResponse>({
    url: '/api/v1/m/auth/login',
    method: 'POST',
    data: { username, password },
    silent: true,
  })
}

export function fetchMe() {
  return request<StaffProfile>({ url: '/api/v1/m/auth/me' })
}

export function fetchStore() {
  return request<StoreDetail>({ url: '/api/v1/m/store' })
}
