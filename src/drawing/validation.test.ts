import { describe, expect, it } from 'vitest'
import { MAX_POINTS_PER_STROKE, MAX_STROKES } from '../constants'
import type { DrawingData } from '../types'
import { validateDrawing } from './validation'

const drawing = (points: DrawingData['strokes'][number]['points']): DrawingData => ({
  version: 1,
  width: 320,
  height: 320,
  strokes: [{ width: 4, points }],
})

describe('validateDrawing', () => {
  it('accepts a small normalized drawing', () => {
    expect(validateDrawing(drawing([[0, 0], [0.5, 0.5], [1, 1]]))).toBeNull()
  })

  it('rejects empty and out-of-bounds drawings', () => {
    expect(validateDrawing({ ...drawing([]), strokes: [] })).toMatch(/Draw something/)
    expect(validateDrawing(drawing([[1.01, 0.5]]))).toMatch(/outside/)
  })

  it('accepts hex ink colors and rejects arbitrary color markup', () => {
    expect(validateDrawing({
      ...drawing([[0.5, 0.5]]),
      strokes: [{ width: 2, color: '#245f9e', points: [[0.5, 0.5]] }],
    })).toBeNull()
    expect(validateDrawing({
      ...drawing([[0.5, 0.5]]),
      strokes: [{ width: 2, color: 'url(bad)', points: [[0.5, 0.5]] }],
    })).toMatch(/color/)
  })

  it('enforces stroke and point limits', () => {
    const tooManyStrokes: DrawingData = {
      ...drawing([[0.5, 0.5]]),
      strokes: Array.from({ length: MAX_STROKES + 1 }, () => ({ width: 4, points: [[0.5, 0.5]] })),
    }
    const tooManyPoints = drawing(
      Array.from({ length: MAX_POINTS_PER_STROKE + 1 }, () => [0.5, 0.5] as const),
    )

    expect(validateDrawing(tooManyStrokes)).toMatch(/too many strokes/)
    expect(validateDrawing(tooManyPoints)).toMatch(/too detailed/)
  })
})
