import type { BoardSnapshot, DrawingData, NotePlacement } from '../types'

export interface BoardGateway {
  load(): Promise<BoardSnapshot>
  subscribe(onChange: (snapshot: BoardSnapshot) => void): () => void
  createText(text: string, placement: NotePlacement): Promise<BoardSnapshot>
  createDrawing(drawing: DrawingData, placement: NotePlacement): Promise<BoardSnapshot>
  addPin(noteId: string): Promise<BoardSnapshot>
  removePin(noteId: string): Promise<BoardSnapshot>
  removeNote(noteId: string): Promise<BoardSnapshot>
}

export class BoardActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardActionError'
  }
}
