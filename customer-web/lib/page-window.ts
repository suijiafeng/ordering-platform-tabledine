import type { PageResult } from './types'

/** 重新读取整个已加载窗口，并追到原末项：头部新记录挤到下一页时不丢尾。 */
export async function fetchPageWindow<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  keyOf: (item: T) => string | number,
  pageCount: number,
  anchor: string | number | undefined,
  isCurrent: () => boolean,
) {
  const list: T[] = []
  const seen = new Set<string | number>()
  let page = 0
  let total = 0
  let exhausted = false
  do {
    const next = await fetchPage(page + 1)
    if (!isCurrent()) return null
    page++
    total = next.total
    for (const item of next.list) {
      const key = keyOf(item)
      if (!seen.has(key)) { seen.add(key); list.push(item) }
    }
    exhausted = next.list.length === 0 || list.length >= total
  } while (!exhausted && (page < pageCount || (anchor !== undefined && !seen.has(anchor))))
  return { list, page, total, exhausted }
}
