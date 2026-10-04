import { request } from '../utils/request'
import type { MenuView } from './types'

/** 完整菜单（无需登录） */
export function fetchMenu(storeId: number) {
  return request<MenuView>({ url: `/api/v1/c/stores/${storeId}/menu`, auth: false })
}
