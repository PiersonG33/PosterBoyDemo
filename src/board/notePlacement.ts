import { BOARD_HEIGHT, BOARD_WIDTH } from '../constants'
import type { BoardNote, NotePlacement } from '../types'
import { pointTouchesNote } from './pinPlacement'

export function isNotePlacementAvailable(
  notes: BoardNote[],
  placement: NotePlacement,
  noteSize: number,
) {
  return notes.every((note) => {
    if (note.removedAt !== null) return true

    const existingCenter = {
      x: note.boardX + noteSize / BOARD_WIDTH / 2,
      y: note.boardY + noteSize / BOARD_HEIGHT / 2,
    }
    return !pointTouchesNote(existingCenter, placement, noteSize)
  })
}
