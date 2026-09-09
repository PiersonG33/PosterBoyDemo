import { describe, expect, it } from 'vitest'
import { calculatePlacement } from './calculatePlacement'

const board = { left: 20, top: 80, width: 1100, height: 1000 }
const viewport = { left: 10, top: 70, width: 1200, height: 800 }

describe('calculatePlacement', () => {
  it('places the note under the cursor and centers it for editing', () => {
    const selection = calculatePlacement({
      board,
      viewport,
      clientX: 570,
      clientY: 380,
      noteSize: 218,
    })

    expect(selection.placement.boardX).toBeCloseTo(441 / 1100)
    expect(selection.placement.boardY).toBeCloseTo(278.2 / 1000)
    expect(selection.focusX).toBeCloseTo(0.5)
    expect(selection.scale).toBeCloseTo(2.788, 2)
  })

  it('keeps the whole note inside every board edge', () => {
    const topLeft = calculatePlacement({
      board,
      viewport,
      clientX: -100,
      clientY: -100,
      noteSize: 218,
    })
    const bottomRight = calculatePlacement({
      board,
      viewport,
      clientX: 5000,
      clientY: 5000,
      noteSize: 218,
    })

    expect(topLeft.placement.boardX).toBe(0)
    expect(topLeft.placement.boardY).toBe(0)
    expect(bottomRight.placement.boardX).toBeCloseTo((1100 - 218) / 1100)
    expect(bottomRight.placement.boardY).toBeCloseTo((1000 - 218) / 1000)
  })
})
