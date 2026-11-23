import { describe, expect, it, vi, afterEach } from 'vitest'
import { storeDay, storeTime, storeToday } from './storeTime'

describe('storeTime', () => {
  afterEach(() => { vi.useRealTimers() })

  it('formats instants in the store time zone', () => {
    expect(storeTime('2026-11-23T05:00:00Z').format('MM-DD HH:mm')).toBe('11-23 13:00')
    expect(storeTime('2026-11-23T14:30:00+09:00').hour()).toBe(13)
  })

  it('uses the store date for "today" around midnight', () => {
    // 东京 11-24 00:30 = 门店 11-23 23:30
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T15:30:00Z'))
    expect(storeToday()).toBe('2026-11-23')
    expect(storeDay().format('YYYY-MM-DD')).toBe('2026-11-23')
    expect(storeTime().subtract(1, 'day').format('YYYY-MM-DD')).toBe('2026-11-22')
  })
})
