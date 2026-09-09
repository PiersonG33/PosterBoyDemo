import { describe, expect, it } from 'vitest'
import { getNoteSize, normalizeDemoSettings } from './demoSettings'

describe('demo settings', () => {
  it('maps the default scale to sixty percent of the reference note', () => {
    expect(getNoteSize({ noteSizePercent: 60, randomTilt: true })).toBeCloseTo(130.8)
  })

  it('keeps debug note sizes inside the supported range', () => {
    expect(normalizeDemoSettings({ noteSizePercent: 12, randomTilt: true }).noteSizePercent).toBe(40)
    expect(normalizeDemoSettings({ noteSizePercent: 150, randomTilt: false }).noteSizePercent).toBe(100)
  })
})
