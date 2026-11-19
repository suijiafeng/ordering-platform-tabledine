'use client'

import { useCallback, useRef, useState } from 'react'
import { ignoreShownError } from '@/lib/errors'
import { fetchPageWindow } from '@/lib/page-window'
import type { PageResult } from '@/lib/types'
import { useVisiblePolling } from './useVisiblePolling'

/** 分页列表后台同步整个已加载范围，不清空界面、滚动位置或筛选。 */
export function usePagedPolling<T>(fetchPage: (page: number) => Promise<PageResult<T>>, keyOf: (item: T) => string | number) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const committed = useRef({ items: [] as T[], page: 0 })
  const requestedPages = useRef(1)
  const moreFailure = useRef(false)

  const refresh = useVisiblePolling(async ({ background, isCurrent }) => {
    const previous = committed.current
    // 翻页失败后，后台只同步已成功加载的范围；失败页由用户明确重试。
    const preserveMoreFailure = background && moreFailure.current
    const target = preserveMoreFailure ? Math.max(1, previous.page) : requestedPages.current
    const loadingMore = target > Math.max(1, previous.page)
    const last = previous.items[previous.items.length - 1]
    try {
      const result = await fetchPageWindow(fetchPage, keyOf, target, last === undefined ? undefined : keyOf(last), isCurrent)
      if (!result || !isCurrent()) return
      committed.current = { items: result.list, page: result.page }
      if (!preserveMoreFailure) requestedPages.current = result.page
      setItems(result.list)
      setTotal(result.total)
      setExhausted(result.exhausted)
      setFailed(false)
      if (!preserveMoreFailure) { moreFailure.current = false; setMoreFailed(false) }
    } catch (error) {
      ignoreShownError(error)
      if (isCurrent()) {
        if (loadingMore) { moreFailure.current = true; setMoreFailed(true) }
        else setFailed(true)
      }
    } finally {
      if (isCurrent()) setLoaded(true)
    }
  })

  const loadMore = useCallback(async () => {
    requestedPages.current = Math.max(requestedPages.current, committed.current.page + 1)
    await refresh()
  }, [refresh])

  return {
    items, loaded, failed, moreFailed, refresh, loadMore,
    hasMore: loaded && !failed && !moreFailed && !exhausted && items.length < total,
  }
}
