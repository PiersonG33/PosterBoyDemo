import { describe, expect, it } from 'vitest'
import type { BoardSnapshot } from '../types'
import { applyOptimisticRemovals } from './optimisticRemovals'

const snapshot: BoardSnapshot = {
  notes: [{
    id: 'note-1',
    createdAt: '2026-09-09T12:00:00.000Z',
    contentType: 'text',
    textContent: 'hello',
    drawingData: null,
    boardX: 0.2,
    boardY: 0.3,
    rotation: 0,
    color: 'butter',
    removedAt: null,
  }],
  pins: [{ id: 'pin-1', x: 0.25, y: 0.35 }],
  budget: {
    limit: 20,
    used: 0,
    windowStartedAt: '2026-09-09T12:00:00.000Z',
    windowEndsAt: '2026-09-09T12:10:00.000Z',
  },
}

describe('optimistic removals', () => {
  it('marks a note removed and hides a pin before the server responds', () => {
    const optimistic = applyOptimisticRemovals(
      snapshot,
      new Map([['note-1', '2026-09-09T12:05:00.000Z']]),
      new Set(['pin-1']),
    )

    expect(optimistic.notes[0].removedAt).toBe('2026-09-09T12:05:00.000Z')
    expect(optimistic.pins).toEqual([])
    expect(snapshot.notes[0].removedAt).toBeNull()
    expect(snapshot.pins).toHaveLength(1)
  })

  it('leaves an authoritative removal timestamp intact', () => {
    const authoritative = {
      ...snapshot,
      notes: [{ ...snapshot.notes[0], removedAt: '2026-09-09T12:04:00.000Z' }],
    } satisfies BoardSnapshot

    const optimistic = applyOptimisticRemovals(
      authoritative,
      new Map([['note-1', '2026-09-09T12:05:00.000Z']]),
      new Set(),
    )

    expect(optimistic.notes[0].removedAt).toBe('2026-09-09T12:04:00.000Z')
  })
})
