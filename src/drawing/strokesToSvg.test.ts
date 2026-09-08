import { describe, expect, it } from 'vitest'
import type { DrawingData } from '../types'
import { strokesToSvg } from './strokesToSvg'

describe('strokesToSvg', () => {
  it('renders strokes and dots into a deterministic SVG', () => {
    const drawing: DrawingData = {
      version: 1,
      width: 320,
      height: 320,
      strokes: [
        { width: 4, points: [[0.1, 0.2], [0.5, 0.75]] },
        { width: 6, points: [[0.25, 0.5]] },
      ],
    }

    const svg = strokesToSvg(drawing)

    expect(svg).toContain('points="32.00,64.00 160.00,240.00"')
    expect(svg).toContain('cx="80.00" cy="160.00" r="3.00"')
    expect(svg).toContain('viewBox="0 0 320 320"')
  })

  it('only generates application-owned markup', () => {
    const drawing: DrawingData = {
      version: 1,
      width: 320,
      height: 320,
      strokes: [{ width: 4, points: [[-1, 5]] }],
    }

    const svg = strokesToSvg(drawing)
    expect(svg).not.toContain('<script')
    expect(svg).toContain('cx="0.00" cy="320.00"')
  })
})
