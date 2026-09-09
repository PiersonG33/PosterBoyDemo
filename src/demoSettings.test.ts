import { describe, expect, it } from 'vitest'
import { defaultDemoSettings, getNoteSize, normalizeDemoSettings } from './demoSettings'

describe('demo settings', () => {
  it('maps the default scale to sixty percent of the reference note', () => {
    expect(getNoteSize({ noteSizePercent: 60, randomTilt: true, curvedPeel: false })).toBeCloseTo(130.8)
    expect(defaultDemoSettings.curvedPeel).toBe(false)
  })

  it('keeps debug note sizes inside the supported range', () => {
    expect(normalizeDemoSettings({ noteSizePercent: 12, randomTilt: true, curvedPeel: false }).noteSizePercent).toBe(40)
    expect(normalizeDemoSettings({ noteSizePercent: 150, randomTilt: false, curvedPeel: true }).noteSizePercent).toBe(100)
  })
})
