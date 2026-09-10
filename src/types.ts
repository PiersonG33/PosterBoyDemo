export type NoteColor = 'butter' | 'rose' | 'mint' | 'sky' | 'lavender'

export interface PinPosition {
  x: number
  y: number
}

export interface BoardPin extends PinPosition {
  id: string
  createdAt: string
}

export type DrawingPoint = readonly [number, number]

export interface DrawingStroke {
  width: number
  color?: string
  points: DrawingPoint[]
}

export interface DrawingData {
  version: 1
  width: number
  height: number
  strokes: DrawingStroke[]
}

interface NoteBase {
  id: string
  createdAt: string
  boardX: number
  boardY: number
  rotation: number
  color: NoteColor
  removedAt: string | null
}

export interface TextNote extends NoteBase {
  contentType: 'text'
  textContent: string
  drawingData: null
}

export interface DrawingNote extends NoteBase {
  contentType: 'drawing'
  textContent: null
  drawingData: DrawingData
}

export type BoardNote = TextNote | DrawingNote

export interface ActionBudget {
  limit: number
  used: number
  windowStartedAt: string
  windowEndsAt: string
}

export interface BoardSnapshot {
  notes: BoardNote[]
  pins: BoardPin[]
  budget: ActionBudget
}

export interface NotePlacement {
  boardX: number
  boardY: number
  rotation: number
  color: NoteColor
}

export interface PlacementSelection {
  placement: NotePlacement
  focusX: number
  focusY: number
  offsetX: number
  offsetY: number
  scale: number
}
