import type { BoardNote, BoardPin } from '../types'

export const noteLayerKey = (noteId: string) => `note:${noteId}`
export const pinLayerKey = (pinId: string) => `pin:${pinId}`

export function getBoardLayers(notes: BoardNote[], pins: BoardPin[]) {
  const items = [
    ...notes.map((note, originalIndex) => ({
      key: noteLayerKey(note.id),
      createdAt: note.createdAt,
      originalIndex,
    })),
    ...pins.map((pin, pinIndex) => ({
      key: pinLayerKey(pin.id),
      createdAt: pin.createdAt,
      originalIndex: notes.length + pinIndex,
    })),
  ].sort((a, b) => {
    const dateDifference = Date.parse(a.createdAt) - Date.parse(b.createdAt)
    return dateDifference || a.originalIndex - b.originalIndex
  })

  return new Map(items.map((item, layer) => [item.key, layer]))
}
