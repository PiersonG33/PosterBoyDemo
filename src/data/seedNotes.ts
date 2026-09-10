import { BOARD_HEIGHT, BOARD_WIDTH } from '../constants'
import type { BoardNote, BoardPin, DrawingData, NoteColor } from '../types'

const pinSpots = [
  [0.5, 0.08],
  [0.18, 0.2],
  [0.82, 0.18],
  [0.29, 0.76],
  [0.76, 0.72],
  [0.5, 0.48],
  [0.12, 0.54],
  [0.88, 0.49],
] as const

const seedPinCounts: Record<string, number> = {}

const sketch = (strokes: DrawingData['strokes']): DrawingData => ({
  version: 1,
  width: 320,
  height: 320,
  strokes,
})

const text = (
  id: string,
  textContent: string,
  boardX: number,
  boardY: number,
  rotation: number,
  color: NoteColor,
  pinTotal = 0,
): BoardNote => {
  seedPinCounts[id] = pinTotal
  return {
    id,
    createdAt: '2026-09-08T12:00:00.000Z',
    contentType: 'text',
    textContent,
    drawingData: null,
    boardX,
    boardY,
    rotation,
    color,
    removedAt: null,
  }
}

const drawing = (
  id: string,
  drawingData: DrawingData,
  boardX: number,
  boardY: number,
  rotation: number,
  color: NoteColor,
  pinTotal = 0,
): BoardNote => {
  seedPinCounts[id] = pinTotal
  return {
    id,
    createdAt: '2026-09-08T12:00:00.000Z',
    contentType: 'drawing',
    textContent: null,
    drawingData,
    boardX,
    boardY,
    rotation,
    color,
    removedAt: null,
  }
}

const seedNoteTemplates: BoardNote[] = [
  text('seed-1', 'Take a note.\nLeave a note.', 0.06, 0.07, -2.2, 'butter', 3),
  text('seed-2', 'What should the internet feel like?', 0.29, 0.04, 1.8, 'rose', 7),
  drawing(
    'seed-3',
    sketch([
      { width: 5, points: [[0.18, 0.53], [0.3, 0.35], [0.5, 0.29], [0.7, 0.35], [0.82, 0.53], [0.73, 0.72], [0.51, 0.79], [0.29, 0.71], [0.18, 0.53]] },
      { width: 5, points: [[0.36, 0.49], [0.37, 0.49]] },
      { width: 5, points: [[0.63, 0.49], [0.64, 0.49]] },
      { width: 4, points: [[0.36, 0.62], [0.48, 0.68], [0.63, 0.61]] },
    ]),
    0.55, 0.055, -1.3, 'mint', 2,
  ),
  text('seed-4', 'You have 20 moves.\nSpend them wisely.', 0.78, 0.06, 2.6, 'sky', 4),
  text('seed-5', 'tiny experiments > big opinions', 0.14, 0.32, 2.1, 'lavender', 1),
  drawing(
    'seed-6',
    sketch([
      { width: 7, points: [[0.5, 0.82], [0.48, 0.65], [0.5, 0.49], [0.48, 0.35], [0.5, 0.16]] },
      { width: 6, points: [[0.5, 0.5], [0.38, 0.39], [0.27, 0.38], [0.29, 0.51], [0.5, 0.58]] },
      { width: 6, points: [[0.49, 0.42], [0.59, 0.29], [0.72, 0.29], [0.71, 0.43], [0.5, 0.53]] },
      { width: 5, points: [[0.37, 0.82], [0.49, 0.76], [0.63, 0.82]] },
    ]),
    0.42, 0.34, -3.2, 'butter', 5,
  ),
  text('seed-7', 'PIN THE GOOD STUFF', 0.68, 0.34, 1.1, 'rose', 8),
  text('seed-8', 'meet me by the corkboard after lunch', 0.02, 0.59, -1.5, 'mint'),
  text('seed-9', 'A place is made by the people who change it.', 0.32, 0.61, 2.8, 'sky', 6),
  drawing(
    'seed-10',
    sketch([
      { width: 5, points: [[0.15, 0.59], [0.27, 0.45], [0.39, 0.57], [0.51, 0.34], [0.64, 0.57], [0.76, 0.44], [0.86, 0.59]] },
      { width: 5, points: [[0.18, 0.69], [0.84, 0.69]] },
      { width: 4, points: [[0.26, 0.68], [0.26, 0.8]] },
      { width: 4, points: [[0.74, 0.68], [0.74, 0.8]] },
    ]),
    0.59, 0.65, -2, 'lavender', 1,
  ),
  text('seed-11', 'draw something weird →', 0.8, 0.58, 3.4, 'butter', 2),
  text('seed-12', 'This board belongs to whoever shows up.', 0.16, 0.76, -2.7, 'rose', 4),
  text('seed-13', 'hello, stranger ✦', 0.48, 0.76, 1.4, 'mint'),
  text('seed-14', 'Protect it or pull it down.', 0.75, 0.76, -1.8, 'sky', 3),
]

export function createSeedNotes(randomTilt: boolean, noteSize: number): BoardNote[] {
  const maxBoardX = Math.max(0, 1 - noteSize / BOARD_WIDTH)
  const maxBoardY = Math.max(0, 1 - noteSize / BOARD_HEIGHT)
  return structuredClone(seedNoteTemplates).map((note) => ({
    ...note,
    boardX: Math.min(note.boardX, maxBoardX),
    boardY: Math.min(note.boardY, maxBoardY),
    rotation: randomTilt ? note.rotation : 0,
  }))
}

export function createSeedPins(notes: BoardNote[], noteSize: number): BoardPin[] {
  return notes.flatMap((note) => {
    const radians = (note.rotation * Math.PI) / 180
    const centerX = note.boardX + noteSize / BOARD_WIDTH / 2
    const centerY = note.boardY + noteSize / BOARD_HEIGHT / 2

    return pinSpots.slice(0, seedPinCounts[note.id] ?? 0).map(([x, y], index) => {
      const localX = (x - 0.5) * noteSize
      const localY = (y - 0.5) * noteSize
      const rotatedX = localX * Math.cos(radians) - localY * Math.sin(radians)
      const rotatedY = localX * Math.sin(radians) + localY * Math.cos(radians)
      return {
        id: `${note.id}-pin-${index + 1}`,
        createdAt: '2026-09-08T12:30:00.000Z',
        x: centerX + rotatedX / BOARD_WIDTH,
        y: centerY + rotatedY / BOARD_HEIGHT,
      }
    })
  })
}
