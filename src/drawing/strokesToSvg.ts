import type { DrawingData, DrawingPoint } from '../types'

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const pointToCoordinate = (
  point: DrawingPoint,
  width: number,
  height: number,
) => `${(clamp(point[0]) * width).toFixed(2)},${(clamp(point[1]) * height).toFixed(2)}`

export function strokesToSvg(drawing: DrawingData): string {
  const paths = drawing.strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => {
      const coordinates = stroke.points
        .map((point) => pointToCoordinate(point, drawing.width, drawing.height))
        .join(' ')

      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0]
        return `<circle cx="${(clamp(x) * drawing.width).toFixed(2)}" cy="${(clamp(y) * drawing.height).toFixed(2)}" r="${(stroke.width / 2).toFixed(2)}" fill="#27231f"/>`
      }

      return `<polyline points="${coordinates}" fill="none" stroke="#27231f" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="Hand-drawn note">${paths}</svg>`
}
