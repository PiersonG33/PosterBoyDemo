export const MAX_TEXT_LENGTH = 500
export const MAX_STROKES = 120
export const MAX_POINTS_PER_STROKE = 800
export const MAX_DRAWING_POINTS = 8_000
export const MAX_ACTIVE_NOTES = 120

export const BOARD_WIDTH = 1_352
export const BOARD_HEIGHT = 813
export const REFERENCE_NOTE_SIZE = 218
export const DEFAULT_NOTE_SIZE_PERCENT = 60
export const MIN_NOTE_SIZE_PERCENT = 40
export const MAX_NOTE_SIZE_PERCENT = 100
export const PIN_COLLISION_DISTANCE = 18
export const PIN_REMOVAL_HOLD_MS = 750
export const NOTE_REMOVAL_HOLD_MS = 1_050

export const ACTION_LIMIT = 20
export const ACTION_WINDOW_MS = 10 * 60 * 1_000

export const NOTE_COLORS = [
  'butter',
  'rose',
  'mint',
  'sky',
  'lavender',
] as const

export const PEN_SIZES = [2, 4, 8] as const
export const DEFAULT_PEN_SIZE = PEN_SIZES[0]
export const DEFAULT_PEN_COLOR = '#29241f'
