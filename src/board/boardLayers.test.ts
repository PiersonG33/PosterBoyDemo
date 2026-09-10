import { describe, expect, it } from 'vitest'
import type { BoardNote, BoardPin } from '../types'
import { getBoardLayers, noteLayerKey, pinLayerKey } from './boardLayers'

const note = (id: string, createdAt: string): BoardNote => ({
  id,
  createdAt,
  contentType: 'text',
  textContent: id,
  drawingData: null,
  boardX: 0.2,
  boardY: 0.2,
  rotation: 0,
  color: 'butter',
  removedAt: null,
})

const pin = (id: string, createdAt: string): BoardPin => ({
  id,
  createdAt,
  x: 0.25,
  y: 0.25,
})

describe('board layers', () => {
  it('places every newer object above older board objects', () => {
    const layers = getBoardLayers(
      [note('old-note', '2026-09-09T12:00:00.000Z'), note('new-note', '2026-09-09T12:02:00.000Z')],
      [pin('middle-pin', '2026-09-09T12:01:00.000Z'), pin('new-pin', '2026-09-09T12:03:00.000Z')],
    )

    expect(layers.get(noteLayerKey('old-note'))).toBeLessThan(layers.get(pinLayerKey('middle-pin'))!)
    expect(layers.get(pinLayerKey('middle-pin'))).toBeLessThan(layers.get(noteLayerKey('new-note'))!)
    expect(layers.get(noteLayerKey('new-note'))).toBeLessThan(layers.get(pinLayerKey('new-pin'))!)
  })
})
