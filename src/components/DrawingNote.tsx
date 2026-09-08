import { strokesToSvg } from '../drawing/strokesToSvg'
import type { DrawingData } from '../types'

interface DrawingNoteProps {
  drawing: DrawingData
}

export function DrawingNote({ drawing }: DrawingNoteProps) {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(strokesToSvg(drawing))}`

  return <img className="drawing-note" src={source} alt="A hand-drawn sticky note" />
}
