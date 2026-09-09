import type { BoardSnapshot, DrawingData, NotePlacement, PinPosition } from '../types'

export type BoardConnectionStatus = 'local' | 'connecting' | 'live' | 'offline'

export interface BoardGateway {
  readonly mode: 'local' | 'shared'
  load(): Promise<BoardSnapshot>
  reset(): Promise<BoardSnapshot>
  subscribe(
    onChange: (snapshot: BoardSnapshot) => void,
    onStatus?: (status: BoardConnectionStatus) => void,
  ): () => void
  createText(text: string, placement: NotePlacement): Promise<BoardSnapshot>
  createDrawing(drawing: DrawingData, placement: NotePlacement): Promise<BoardSnapshot>
  addPin(position: PinPosition): Promise<BoardSnapshot>
  removePin(pinId: string): Promise<BoardSnapshot>
  removeNote(noteId: string): Promise<BoardSnapshot>
}

export class BoardActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardActionError'
  }
}
