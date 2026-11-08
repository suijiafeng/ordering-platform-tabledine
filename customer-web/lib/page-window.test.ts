import { describe, expect, it, vi } from 'vitest'
import { fetchPageWindow } from './page-window'

const response = (list: number[], total: number, page: number) => ({ list, total, page, pageSize: 2 })

describe('分页同步窗口', () => {
  it('头部插入记录后继续追到原末项，保留跨页的已加载记录', async () => {
    const fetchPage = vi.fn(async (page: number) => [response([0, 1], 5, 1), response([2, 3], 5, 2), response([4], 5, 3)][page - 1])
    const result = await fetchPageWindow(fetchPage, (id) => id, 2, 4, () => true)
    expect(result?.list).toEqual([0, 1, 2, 3, 4])
    expect(result?.page).toBe(3)
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3])
  })

  it('页边界重复时去重，继续找原末项', async () => {
    const fetchPage = vi.fn(async (page: number) => [response([1, 2], 4, 1), response([2, 3], 4, 2), response([4], 4, 3)][page - 1])
    expect((await fetchPageWindow(fetchPage, (id) => id, 2, 4, () => true))?.list).toEqual([1, 2, 3, 4])
  })

  it('页面失效后停止读取后续页，不发布半个窗口', async () => {
    const fetchPage = vi.fn(async () => response([1, 2], 4, 1))
    expect(await fetchPageWindow(fetchPage, (id) => id, 2, 4, () => false)).toBeNull()
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('中间页失败不返回部分新数据', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('离线')
      return response([1, 2], 4, page)
    })
    await expect(fetchPageWindow(fetchPage, (id) => id, 2, 4, () => true)).rejects.toThrow('离线')
  })

  it('末项删除时在空页终止，不会无限翻页', async () => {
    const fetchPage = vi.fn(async (page: number) => response(page === 1 ? [1, 2] : [], 3, page))
    expect((await fetchPageWindow(fetchPage, (id) => id, 2, 4, () => true))?.list).toEqual([1, 2])
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})
