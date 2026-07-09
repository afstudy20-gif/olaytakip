import { describe, it, expect } from 'vitest'
import { fmtNumber, fmtPercent, fmtDate } from './format'

describe('format helpers', () => {
  it('formats numbers with Turkish locale', () => {
    expect(fmtNumber(1234.5)).toBe('1.234,5')
    expect(fmtNumber(null)).toBe('-')
    expect(fmtNumber(undefined)).toBe('-')
  })

  it('formats percentages', () => {
    expect(fmtPercent(12.34)).toBe('12,3%')
    expect(fmtPercent(null)).toBe('-')
  })

  it('formats dates', () => {
    expect(fmtDate('2024-01-15')).toMatch(/15\.01\.2024/)
    expect(fmtDate(null)).toBe('-')
    expect(fmtDate('not a date')).toBe('not a date')
  })
})
