import { describe, expect, it } from 'vitest'
import { BOARD_WIDTH, PIN_COLLISION_DISTANCE, REFERENCE_NOTE_SIZE } from '../constants'
import type { BoardNote, BoardPin } from '../types'
import { isPinPositionAvailable, noteHasPins, pinTouchesNote } from './pinPlacement'

const pins: BoardPin[] = [{ id: 'pin-1', x: 0.5, y: 0.5 }]

describe('board pin geometry', () => {
  it('allows pins anywhere on the board while preventing center overlap', () => {
    expect(isPinPositionAvailable(pins, { x: 0, y: 0 })).toBe(true)
    expect(isPinPositionAvailable(pins, { x: 1, y: 1 })).toBe(true)
    expect(isPinPositionAvailable(pins, { x: 0.5, y: 0.5 })).toBe(false)
    expect(isPinPositionAvailable(pins, {
      x: 0.5 + PIN_COLLISION_DISTANCE / BOARD_WIDTH / 2,
      y: 0.5,
    })).toBe(false)
  })

  it('rejects positions outside the board', () => {
    expect(isPinPositionAvailable(pins, { x: -0.01, y: 0.5 })).toBe(false)
    expect(isPinPositionAvailable(pins, { x: 0.5, y: 1.01 })).toBe(false)
  })

  it('treats a point inside a rotated note as touching it', () => {
    const note: BoardNote = {
      id: 'note-1',
      createdAt: '2026-09-08T12:00:00.000Z',
      contentType: 'text',
      textContent: 'hello',
      drawingData: null,
      boardX: 0.2,
      boardY: 0.2,
      rotation: 4,
      color: 'butter',
      removedAt: null,
    }

    expect(pinTouchesNote({ x: 0.3, y: 0.3 }, note, REFERENCE_NOTE_SIZE)).toBe(true)
    expect(pinTouchesNote({ x: 0.65, y: 0.65 }, note, REFERENCE_NOTE_SIZE)).toBe(false)

    const overlappingNote = { ...note, id: 'note-2', createdAt: '2026-09-08T12:01:00.000Z' }
    expect(noteHasPins(note, [{ id: 'shared-pin', x: 0.3, y: 0.3 }], REFERENCE_NOTE_SIZE)).toBe(true)
    expect(pinTouchesNote({ x: 0.3, y: 0.3 }, overlappingNote, REFERENCE_NOTE_SIZE)).toBe(true)
  })
})
