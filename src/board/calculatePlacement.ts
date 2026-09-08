import type { PlacementSelection } from '../types'

interface Rectangle {
  left: number
  top: number
  width: number
  height: number
}

interface PlacementInput {
  board: Rectangle
  viewport: Rectangle
  clientX: number
  clientY: number
  noteSize: number
}

export function calculatePlacement({
  board,
  viewport,
  clientX,
  clientY,
  noteSize,
}: PlacementInput): PlacementSelection {
  const cursorX = clientX - board.left
  const cursorY = clientY - board.top
  const left = Math.min(board.width - noteSize, Math.max(0, cursorX - noteSize / 2))
  const top = Math.min(board.height - noteSize, Math.max(0, cursorY - 21))
  const noteCenterX = left + noteSize / 2
  const noteCenterY = top + noteSize / 2
  const centerClientX = board.left + noteCenterX
  const centerClientY = board.top + noteCenterY

  return {
    placement: {
      boardX: left / board.width,
      boardY: top / board.height,
      rotation: 0,
      color: 'butter',
    },
    focusX: noteCenterX / board.width,
    focusY: noteCenterY / board.height,
    offsetX: viewport.left + viewport.width / 2 - centerClientX,
    offsetY: viewport.top + viewport.height / 2 - centerClientY,
    scale: Math.min(
      3,
      Math.max(1.7, Math.min(viewport.width * 0.76, viewport.height * 0.76) / noteSize),
    ),
  }
}
