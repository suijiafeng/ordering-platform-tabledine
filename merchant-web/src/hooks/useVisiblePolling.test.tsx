import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../test/deferred'
import { useVisiblePolling } from './useVisiblePolling'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('visible page synchronization', () => {
  it('keeps its interval while rendering a new callback and uses the latest callback', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const latest = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ callback }) => useVisiblePolling(callback), { initialProps: { callback: first } })
    expect(first).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    rerender({ callback: latest })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
  })

  it('does not overlap slow requests and stops scheduling after unmount', async () => {
    const pending = deferred<void>()
    const refresh = vi.fn().mockReturnValue(pending.promise)
    const { unmount } = renderHook(() => useVisiblePolling(refresh))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(refresh).toHaveBeenCalledOnce()
    unmount()
    await act(async () => { pending.resolve(); await vi.advanceTimersByTimeAsync(10000) })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('pauses while hidden and immediately refreshes on visibility, focus and online', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    renderHook(() => useVisiblePolling(refresh))
    visibility.mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(refresh).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(refresh).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('does not schedule when disabled', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ enabled }) => useVisiblePolling(refresh, { enabled }), { initialProps: { enabled: false } })
    await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(10000) })
    expect(refresh).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(refresh).toHaveBeenCalledOnce()
  })
})
