import type { BoardSnapshot } from '../types'

export function applyOptimisticRemovals(
  snapshot: BoardSnapshot,
  noteRemovals: ReadonlyMap<string, string>,
  pinRemovals: ReadonlySet<string>,
): BoardSnapshot {
  if (noteRemovals.size === 0 && pinRemovals.size === 0) return snapshot

  return {
    ...snapshot,
    notes: snapshot.notes.map((note) => {
      const removedAt = noteRemovals.get(note.id)
      return removedAt && note.removedAt === null ? { ...note, removedAt } : note
    }),
    pins: snapshot.pins.filter((pin) => !pinRemovals.has(pin.id)),
  }
}
