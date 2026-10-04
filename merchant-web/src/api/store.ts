import { request } from '../utils/request'
import type { StoreDetail, StoreUpdateRequest, UploadResult } from './types'

export const fetchStore = () => request<StoreDetail>({ url: '/api/v1/m/store' })

export const updateStore = (data: StoreUpdateRequest) =>
  request<StoreDetail>({ url: '/api/v1/m/store', method: 'PUT', data })

export const setBusinessStatus = (open: boolean) =>
  request<StoreDetail>({ url: '/api/v1/m/store/business-status', method: 'PATCH', data: { open } })

export function uploadImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<UploadResult>({ url: '/api/v1/m/files/upload', method: 'POST', data: form })
}
