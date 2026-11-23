import { describe, expect, it } from 'vitest'
import { clockTime, maskPhone } from './format'
import { cookingMinutes, progressIndex, progressTimes, statusHeroTitle } from './orderProgress'
import type { OrderDetail } from './types'

/** 按运行环境本地时区构造 ISO，避免 CI/开发机时区不同导致时刻断言失败 */
const at = (hour: number, minute: number) => {
  const d = new Date(2026, 10, 22, hour, minute, 0)
  return d.toISOString()
}

const base = {
  logs: [] as OrderDetail['logs'],
  paidAt: at(12, 31),
  cookingStartedAt: null as string | null,
}

describe('maskPhone / clockTime', () => {
  it('masks 11-digit phone', () => {
    expect(maskPhone('13800000001')).toBe('138****0001')
    expect(maskPhone('')).toBe('')
  })
  it('formats clock time in local zone', () => {
    expect(clockTime(at(12, 31))).toBe('12:31')
    expect(clockTime(null)).toBe('')
  })
})

describe('order progress', () => {
  it('maps statuses to 5-step index', () => {
    expect(progressIndex('PAID', null)).toBe(0)
    expect(progressIndex('MAKING', null)).toBe(1)
    expect(progressIndex('MAKING', at(12, 35))).toBe(2)
    expect(progressIndex('READY', at(12, 35))).toBe(3)
    expect(progressIndex('DONE', at(12, 35))).toBe(4)
    expect(progressIndex('CANCELLED', null)).toBe(null)
  })

  it('reads step times from logs and cookingStartedAt', () => {
    const times = progressTimes({
      ...base,
      cookingStartedAt: at(12, 35),
      logs: [
        { toStatus: 'PAID', operatorType: 'SYSTEM', remark: null, createdAt: at(12, 31) },
        { toStatus: 'MAKING', operatorType: 'MERCHANT', remark: null, createdAt: at(12, 32) },
        { toStatus: 'READY', operatorType: 'KITCHEN', remark: null, createdAt: at(12, 44) },
        { toStatus: 'DONE', operatorType: 'MERCHANT', remark: null, createdAt: at(12, 46) },
      ],
    })
    expect(times).toEqual(['12:31', '12:32', '12:35', '12:44', '12:46'])
  })

  it('computes cooking minutes and hero title', () => {
    const started = '2026-11-22T12:00:00+09:00'
    expect(cookingMinutes({ status: 'MAKING', cookingStartedAt: started }, Date.parse('2026-11-22T12:03:20+09:00'))).toBe(3)
    expect(cookingMinutes({ status: 'MAKING', cookingStartedAt: started }, Date.parse('2026-11-22T12:00:10+09:00'))).toBe(1)
    expect(cookingMinutes({ status: 'READY', cookingStartedAt: started })).toBe(null)
    expect(statusHeroTitle('MAKING', started)).toBe('后厨制作中')
    expect(statusHeroTitle('DONE', started)).toBe('已完成')
  })
})
