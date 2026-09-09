import {
  MAX_DRAWING_POINTS,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES,
} from '../constants'
import type { DrawingData } from '../types'

export function validateDrawing(drawing: DrawingData): string | null {
  if (drawing.version !== 1 || drawing.width <= 0 || drawing.height <= 0) {
    return 'This drawing format is not supported.'
  }

  if (drawing.strokes.length === 0) return 'Draw something before posting.'
  if (drawing.strokes.length > MAX_STROKES) return 'This drawing has too many strokes.'

  let totalPoints = 0
  for (const stroke of drawing.strokes) {
    if (stroke.points.length > MAX_POINTS_PER_STROKE) {
      return 'One of the strokes is too detailed.'
    }
    if (stroke.width < 1 || stroke.width > 24) return 'Invalid pen width.'
    if (stroke.color !== undefined && !/^#[0-9a-f]{6}$/i.test(stroke.color)) {
      return 'Invalid pen color.'
    }

    for (const [x, y] of stroke.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        return 'A drawing point falls outside the paper.'
      }
    }
    totalPoints += stroke.points.length
  }

  return totalPoints > MAX_DRAWING_POINTS ? 'This drawing is too detailed.' : null
}
