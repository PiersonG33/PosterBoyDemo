import { NOTE_COLORS } from '../constants'
import type { NotePlacement } from '../types'

export function createPlacement(noteCount: number): NotePlacement {
  const column = noteCount % 4
  const row = Math.floor(noteCount / 4) % 4
  const jitterX = (Math.random() - 0.5) * 0.07
  const jitterY = (Math.random() - 0.5) * 0.045

  return {
    boardX: Math.min(0.81, Math.max(0.025, 0.035 + column * 0.255 + jitterX)),
    boardY: Math.min(0.86, Math.max(0.025, 0.055 + row * 0.255 + jitterY)),
    rotation: Number(((Math.random() - 0.5) * 7).toFixed(1)),
    color: NOTE_COLORS[noteCount % NOTE_COLORS.length],
  }
}
