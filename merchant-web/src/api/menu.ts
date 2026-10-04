import { request } from '../utils/request'
import type { Category, DishDetail, DishItem, DishSaveRequest, PageResult } from './types'

export const listCategories = () => request<Category[]>({ url: '/api/v1/m/categories' })

export const createCategory = (name: string) =>
  request<Category>({ url: '/api/v1/m/categories', method: 'POST', data: { name } })

export const updateCategory = (id: number, data: { name: string; status?: number }) =>
  request<Category>({ url: `/api/v1/m/categories/${id}`, method: 'PUT', data })

export const deleteCategory = (id: number) =>
  request<void>({ url: `/api/v1/m/categories/${id}`, method: 'DELETE' })

export const sortCategories = (ids: number[]) =>
  request<void>({ url: '/api/v1/m/categories/sort', method: 'PUT', data: { ids } })

export const listDishes = (params: { categoryId?: number; keyword?: string; page: number; pageSize: number }) =>
  request<PageResult<DishItem>>({ url: '/api/v1/m/dishes', params })

export const getDish = (id: number) => request<DishDetail>({ url: `/api/v1/m/dishes/${id}` })

export const createDish = (data: DishSaveRequest) =>
  request<DishDetail>({ url: '/api/v1/m/dishes', method: 'POST', data })

export const updateDish = (id: number, data: DishSaveRequest) =>
  request<DishDetail>({ url: `/api/v1/m/dishes/${id}`, method: 'PUT', data })

export const deleteDish = (id: number) => request<void>({ url: `/api/v1/m/dishes/${id}`, method: 'DELETE' })

export const setDishStatus = (id: number, status: number) =>
  request<void>({ url: `/api/v1/m/dishes/${id}/status`, method: 'PATCH', data: { status } })

export const setDishSoldOut = (id: number, soldOut: boolean) =>
  request<void>({ url: `/api/v1/m/dishes/${id}/sold-out`, method: 'PATCH', data: { soldOut } })

export const setDishStock = (id: number, stockQuantity: number | null) =>
  request<void>({ url: `/api/v1/m/dishes/${id}/stock`, method: 'PUT', data: { stockQuantity } })
