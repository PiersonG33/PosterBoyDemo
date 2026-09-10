import { describe, expect, it } from 'vitest'
import { REFERENCE_NOTE_SIZE } from '../constants'
import type { BoardNote, NotePlacement } from '../types'
import { isNotePlacementAvailable } from './notePlacement'

const existingNote: BoardNote = {
  id: 'existing',
  createdAt: '2026-09-09T12:00:00.000Z',
  contentType: 'text',
  textContent: 'hello',
  drawingData: null,
  boardX: 0.2,
  boardY: 0.2,
  rotation: 2,
  color: 'butter',
  removedAt: null,
}

const placement = (boardX: number, boardY: number): NotePlacement => ({
  boardX,
  boardY,
  rotation: -3,
  color: 'rose',
})

describe('note placement', () => {
  it('rejects a new note that covers an existing note center', () => {
    expect(isNotePlacementAvailable(
      [existingNote],
      placement(0.2, 0.2),
      REFERENCE_NOTE_SIZE,
    )).toBe(false)
  })

  it('allows partial overlap that leaves the existing center visible', () => {
    expect(isNotePlacementAvailable(
      [existingNote],
      placement(0.34, 0.2),
      REFERENCE_NOTE_SIZE,
    )).toBe(true)
  })

  it('ignores notes that have already been removed', () => {
    expect(isNotePlacementAvailable(
      [{ ...existingNote, removedAt: '2026-09-09T12:02:00.000Z' }],
      placement(0.2, 0.2),
      REFERENCE_NOTE_SIZE,
    )).toBe(true)
  })
})
