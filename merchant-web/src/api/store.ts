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
<<<<<<< HEAD
<<<<<<< HEAD
  // 上传 + 服务端压缩/缩略图耗时较长，给比普通请求更宽的超时
  return request<UploadResult>({ url: '/api/v1/m/files/upload', method: 'POST', data: form, timeout: 60000 })
=======
  return request<UploadResult>({ url: '/api/v1/m/files/upload', method: 'POST', data: form })
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
  // 上传 + 服务端压缩/缩略图耗时较长，给比普通请求更宽的超时
  return request<UploadResult>({ url: '/api/v1/m/files/upload', method: 'POST', data: form, timeout: 60000 })
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
}
