import { describe, expect, it } from 'vitest'
import { pinTouchesNote } from '../board/pinPlacement'
import { BOARD_HEIGHT } from '../constants'
import { createSeedNotes, createSeedPins } from './seedNotes'

describe('seed board profiles', () => {
  it('can disable every seeded note rotation', () => {
    expect(createSeedNotes(false, 130.8).every((note) => note.rotation === 0)).toBe(true)
  })

  it('regenerates seed pins against the configured note size', () => {
    const noteSize = 130.8
    const notes = createSeedNotes(true, noteSize)
    const pins = createSeedPins(notes, noteSize)

    expect(pins).toHaveLength(46)
    expect(pins.every((pin) => notes.some((note) => pinTouchesNote(pin, note, noteSize)))).toBe(true)
  })

  it('keeps full-size seed notes within the shorter board', () => {
    const noteSize = 218
    const notes = createSeedNotes(true, noteSize)

    expect(notes.every((note) => note.boardY + noteSize / BOARD_HEIGHT <= 1)).toBe(true)
  })
})
