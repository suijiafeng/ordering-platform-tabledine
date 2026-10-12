import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDish } from '../../api/menu'
import type { Category, DishDetail } from '../../api/types'
import { deferred } from '../../test/deferred'
import DishFormDrawer from './DishFormDrawer'

vi.mock('../../api/menu', () => ({ getDish: vi.fn(), createDish: vi.fn(), updateDish: vi.fn() }))
vi.mock('../../components/ImageUpload', () => ({ default: () => null }))

const categories: Category[] = [{ id: 1, name: 'Main', sort: 0, status: 1 }]
const dish = (id: number): DishDetail => ({
  dish: {
    id, categoryId: 1, name: `Dish ${id}`, description: null, price: 1000, image: null,
    sort: 0, status: 1, soldOut: false, stockQuantity: null, dailyStock: null,
  },
  specGroups: [], addonGroups: [],
})
const onClose = vi.fn()
const onSaved = vi.fn()
const drawer = (dishId: number | null, open = true) => (
  <DishFormDrawer dishId={dishId} open={open} categories={categories} defaultCategoryId={1} onClose={onClose} onSaved={onSaved} />
)
const nameInput = () => screen.getByLabelText('菜品名称') as HTMLInputElement
const isLoading = () => document.querySelector('.ant-spin-spinning') !== null

beforeEach(() => { vi.mocked(getDish).mockReset() })

describe('DishFormDrawer interrupted loading', () => {
  it.each(['resolve', 'reject'] as const)('clears edit loading on close → new, even if the old request %ss later', async (outcome) => {
    const pending = deferred<DishDetail>()
    vi.mocked(getDish).mockReturnValue(pending.promise)
    const { rerender } = render(drawer(1))
    expect(isLoading()).toBe(true)
    rerender(drawer(1, false))
    rerender(drawer(null))
    expect(nameInput().value).toBe('')
    expect(isLoading()).toBe(false)

    await act(async () => {
      if (outcome === 'resolve') pending.resolve(dish(1))
      else pending.reject(new Error('Failed old request'))
    })
    expect(nameInput().value).toBe('')
    expect(isLoading()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(getDish).toHaveBeenCalledOnce()
  })

  it('clears loading when switching directly from edit to new', () => {
    vi.mocked(getDish).mockReturnValue(deferred<DishDetail>().promise)
    const { rerender } = render(drawer(1))
    expect(isLoading()).toBe(true)
    rerender(drawer(null))
    expect(nameInput().value).toBe('')
    expect(isLoading()).toBe(false)
  })

  it.each(['resolve', 'reject'] as const)('keeps B loading and values isolated when old A %ss', async (outcome) => {
    const pendingA = deferred<DishDetail>()
    const pendingB = deferred<DishDetail>()
    vi.mocked(getDish).mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise)
    const { rerender } = render(drawer(1))
    rerender(drawer(2))
    await act(async () => {
      if (outcome === 'resolve') pendingA.resolve(dish(1))
      else pendingA.reject(new Error('Failed old request'))
    })
    expect(isLoading()).toBe(true)
    expect(nameInput().value).toBe('')
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { pendingB.resolve(dish(2)) })
    expect(nameInput().value).toBe('Dish 2')
    expect(isLoading()).toBe(false)
  })

  it('ignores a failed detail request after the drawer unmounts', async () => {
    const pending = deferred<DishDetail>()
    vi.mocked(getDish).mockReturnValue(pending.promise)
    const { unmount } = render(drawer(1))
    unmount()
    await act(async () => { pending.reject(new Error('Failed old request')) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes the current edit drawer when its detail request fails', async () => {
    vi.mocked(getDish).mockRejectedValue(new Error('Failed current request'))
    render(drawer(1))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(isLoading()).toBe(false)
  })
})
