import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIN_COLLISION_DISTANCE,
} from '../constants'
import type { BoardNote, BoardPin, PinPosition } from '../types'

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

export function pinTouchesNote(pin: PinPosition, note: BoardNote, noteSize: number) {
  if (note.removedAt !== null) return false

  const centerX = note.boardX + noteSize / BOARD_WIDTH / 2
  const centerY = note.boardY + noteSize / BOARD_HEIGHT / 2
  const deltaX = (pin.x - centerX) * BOARD_WIDTH
  const deltaY = (pin.y - centerY) * BOARD_HEIGHT
  const radians = (-note.rotation * Math.PI) / 180
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians)
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians)

  return Math.abs(localX) <= noteSize / 2 && Math.abs(localY) <= noteSize / 2
}

export function noteHasPins(note: BoardNote, pins: BoardPin[], noteSize: number) {
  return pins.some((pin) => pinTouchesNote(pin, note, noteSize))
}
