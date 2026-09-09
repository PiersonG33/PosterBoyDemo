import type { DrawingData, DrawingPoint } from '../types'
import { DEFAULT_PEN_COLOR } from '../constants'

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const safeColor = (color: string | undefined) => color && /^#[0-9a-f]{6}$/i.test(color)
  ? color
  : DEFAULT_PEN_COLOR

const pointToCoordinate = (
  point: DrawingPoint,
  width: number,
  height: number,
) => `${(clamp(point[0]) * width).toFixed(2)},${(clamp(point[1]) * height).toFixed(2)}`

export function strokesToSvg(drawing: DrawingData): string {
  const paths = drawing.strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => {
      const color = safeColor(stroke.color)
      const coordinates = stroke.points
        .map((point) => pointToCoordinate(point, drawing.width, drawing.height))
        .join(' ')

      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0]
        return `<circle cx="${(clamp(x) * drawing.width).toFixed(2)}" cy="${(clamp(y) * drawing.height).toFixed(2)}" r="${(stroke.width / 2).toFixed(2)}" fill="${color}"/>`
      }

      return `<polyline points="${coordinates}" fill="none" stroke="${color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="Hand-drawn note">${paths}</svg>`
}
