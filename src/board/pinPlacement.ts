import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIN_COLLISION_DISTANCE,
} from '../constants'
import type { BoardNote, BoardPin, PinPosition } from '../types'

interface NoteGeometry {
  boardX: number
  boardY: number
  rotation: number
}

export function isPinPositionAvailable(pins: BoardPin[], position: PinPosition) {
  if (
    !Number.isFinite(position.x) || !Number.isFinite(position.y)
    || position.x < 0 || position.x > 1
    || position.y < 0 || position.y > 1
  ) {
    return false
  }

  return pins.every((pin) => {
    const deltaX = (pin.x - position.x) * BOARD_WIDTH
    const deltaY = (pin.y - position.y) * BOARD_HEIGHT
    return Math.hypot(deltaX, deltaY) >= PIN_COLLISION_DISTANCE
  })
}

export function pointTouchesNote(pin: PinPosition, note: NoteGeometry, noteSize: number) {
  const centerX = note.boardX + noteSize / BOARD_WIDTH / 2
  const centerY = note.boardY + noteSize / BOARD_HEIGHT / 2
  const deltaX = (pin.x - centerX) * BOARD_WIDTH
  const deltaY = (pin.y - centerY) * BOARD_HEIGHT
  const radians = (-note.rotation * Math.PI) / 180
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians)
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians)

  return Math.abs(localX) <= noteSize / 2 && Math.abs(localY) <= noteSize / 2
}

export function pinTouchesNote(pin: PinPosition, note: BoardNote, noteSize: number) {
  return note.removedAt === null && pointTouchesNote(pin, note, noteSize)
}

export function pinPiercesNote(pin: BoardPin, note: BoardNote, noteSize: number) {
  return Date.parse(pin.createdAt) >= Date.parse(note.createdAt)
    && pinTouchesNote(pin, note, noteSize)
}

export function noteHasPins(note: BoardNote, pins: BoardPin[], noteSize: number) {
  return pins.some((pin) => pinPiercesNote(pin, note, noteSize))
}
