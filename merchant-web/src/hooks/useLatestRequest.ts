import { useCallback, useRef } from 'react'

/**
 * 并发请求只采纳最后一次发起的结果。
 * 用法：const begin = useLatestRequest(); 在请求前 const isLatest = begin()，拿到响应后 if (!isLatest()) return。
 * 典型场景：快速切换筛选 / 分页，或定时刷新与操作后刷新交错，较慢的旧响应不能覆盖新数据。
 */
export function useLatestRequest() {
  const seq = useRef(0)
  return useCallback(() => {
    const mine = ++seq.current
    return () => mine === seq.current
  }, [])
}
