import type { BoardSnapshot } from '../types'

export interface OptimisticNoteRemoval {
  removedAt: string
  hideAfter: number
  releaseAfter: number | null
}

export function applyOptimisticRemovals(
  snapshot: BoardSnapshot,
  noteRemovals: ReadonlyMap<string, OptimisticNoteRemoval>,
  pinRemovals: ReadonlySet<string>,
  now = Date.now(),
): BoardSnapshot {
  if (noteRemovals.size === 0 && pinRemovals.size === 0) return snapshot

  return {
    ...snapshot,
    notes: snapshot.notes.flatMap((note) => {
      const removal = noteRemovals.get(note.id)
      if (!removal || (removal.releaseAfter !== null && now >= removal.releaseAfter)) {
        return [note]
      }

      if (now >= removal.hideAfter) return []
      return [{ ...note, removedAt: removal.removedAt }]
    }),
    pins: snapshot.pins.filter((pin) => !pinRemovals.has(pin.id)),
  }
}
