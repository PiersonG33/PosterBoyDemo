export const MAX_TEXT_LENGTH = 500
export const MAX_STROKES = 120
export const MAX_POINTS_PER_STROKE = 800
export const MAX_DRAWING_POINTS = 8_000
export const MAX_ACTIVE_NOTES = 120

export const BOARD_WIDTH = 1_352
export const BOARD_HEIGHT = 1_016
export const NOTE_SIZE = 218
export const NOTE_WIDTH_ON_BOARD = NOTE_SIZE / BOARD_WIDTH
export const NOTE_HEIGHT_ON_BOARD = NOTE_SIZE / BOARD_HEIGHT
export const PIN_COLLISION_DISTANCE = 18

export const ACTION_LIMIT = 20
export const ACTION_WINDOW_MS = 10 * 60 * 1_000

export const NOTE_COLORS = [
  'butter',
  'rose',
  'mint',
  'sky',
  'lavender',
] as const
